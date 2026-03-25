import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertStrictStructure, instructionSchema, toPrintableText } from "@/lib/di-contract";
import { isDirectorRole } from "@/lib/di-rules";

const MANDATORY_LINEAR_SUBORDINATION_FALLBACK = "Подчиняется непосредственному руководителю подразделения";
const MANDATORY_DIRECTOR_SUBORDINATION_TEXT = "Генеральному директору";

function cleanSubordinationForEdit(input: string[]): string[] {
  const removalPatterns: RegExp[] = [
    // Wrong content for "Подчиненность": sometimes LLM puts substitution clause here.
    /на\s*время\s*отсутствия/i,
    /функц(ии|ия)\s*на\s*время\s*отсутствия/i,
    /исполняет\s+назначенн(о(е|ый)|ая|ый|ую|ого|ых)\s+лиц(о|а)/i,
    // Wrong orientation: "в подчинении находится ..." (means employee has subordinates)
    /в\s*прямом\s*подчинени[еи]\s*находится/i,
    /в\s*подчинении\s*находится/i,
    /в\s*его\s*подчинении/i,
    // Another wrong orientation: "ему подчиняются/подчинен(а)"
    /ему\s*подчиня(ют|ются|ется)/i,
    /ему\s*подчинен(у|а|ы)/i,
  ];

  const cleaned = (input ?? [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .filter((line) => !removalPatterns.some((re) => re.test(line)));

  // "Подчиненность" должна быть ровно про "кому подчиняется", а не список.
  if (cleaned.length === 0) return [MANDATORY_LINEAR_SUBORDINATION_FALLBACK];
  return [cleaned[0]];
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const row = await prisma.instructionVersion.findUnique({
    where: { id },
    include: { generationRun: { select: { userId: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.role === "admin";
  const isOwner = row.generationRun?.userId === session.user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.instructionVersion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const row = await prisma.instructionVersion.findUnique({
    where: { id },
    include: {
      generationRun: { select: { userId: true, jobTitleInput: true } },
      jobTitle: { select: { name: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.role === "admin";
  const isOwner = row.generationRun?.userId === session.user.id;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    id: row.id,
    version: row.version,
    createdAt: row.createdAt,
    jobTitleName: row.jobTitle.name,
    templateJson: row.templateJson,
    finalText: row.finalText,
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const base = await prisma.instructionVersion.findUnique({
    where: { id },
    include: {
      generationRun: { select: { userId: true, jobTitleInput: true } },
      jobTitle: { select: { id: true, name: true } },
    },
  });

  if (!base) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.role === "admin";
  const isOwner = base.generationRun?.userId === session.user.id;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let rawBody: unknown = null;
  try {
    rawBody = await request.json();
  } catch {
    rawBody = null;
  }
  const templateJson = (rawBody as { templateJson?: unknown } | null)?.templateJson;
  if (!templateJson) return NextResponse.json({ error: "templateJson is required" }, { status: 400 });

  let payload;
  try {
    payload = instructionSchema.parse(templateJson);
    assertStrictStructure(payload);
  } catch {
    return NextResponse.json({ error: "Invalid DI payload" }, { status: 400 });
  }

  // Post-process "Подчиненность" for edit mode: ensure it contains only "кому подчиняется".
  payload.sections.general.subordination = cleanSubordinationForEdit(payload.sections.general.subordination);
  if (isDirectorRole(payload.templateMeta.positionName)) {
    payload.sections.general.subordination = [MANDATORY_DIRECTOR_SUBORDINATION_TEXT];
  }

  const finalText = toPrintableText(payload);

  const maxVersion = await prisma.instructionVersion.aggregate({
    where: { jobTitleId: base.jobTitle.id },
    _max: { version: true },
  });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  const run = await prisma.generationRun.create({
    data: {
      userId: session.user.id,
      jobTitleInput: base.generationRun?.jobTitleInput ?? payload.templateMeta.positionName,
      status: "edited",
      promptVersion: "v1",
    },
  });

  const created = await prisma.instructionVersion.create({
    data: {
      jobTitleId: base.jobTitle.id,
      generationRunId: run.id,
      version: nextVersion,
      templateJson: payload,
      finalText,
    },
  });

  await prisma.generationRun.update({
    where: { id: run.id },
    data: { status: "success" },
  });

  return NextResponse.json({ id: created.id, version: created.version });
}
