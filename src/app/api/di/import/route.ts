import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getResolvedApiConfig } from "@/lib/api-settings";
import { assertStrictStructure, instructionSchema, toPrintableText } from "@/lib/di-contract";
import { applyTripleTextQuality } from "@/lib/di-text-quality";
import { FIXED_SUBORDINATION_LINES } from "@/lib/di-rules";
import { normalizeJobTitle } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const allowed = checkRateLimit(`import:${ip}`, 20, 60_000);
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const templateJson = (body as { templateJson?: unknown } | null)?.templateJson;
  if (!templateJson) return NextResponse.json({ error: "templateJson is required" }, { status: 400 });

  let payload;
  try {
    payload = instructionSchema.parse(templateJson);
    assertStrictStructure(payload);
  } catch {
    return NextResponse.json({ error: "Invalid DI payload" }, { status: 400 });
  }

  payload.sections.general.subordination = FIXED_SUBORDINATION_LINES;

  payload = await applyTripleTextQuality(payload, { resolvedApi: await getResolvedApiConfig() });
  assertStrictStructure(payload);

  const positionName = payload.templateMeta.positionName.trim();
  const normalized = normalizeJobTitle(positionName);

  const jobTitle = await prisma.jobTitle.upsert({
    where: { normalized },
    update: { name: positionName || normalized },
    create: { name: positionName || normalized, normalized, synonyms: "" },
  });

  const maxVersion = await prisma.instructionVersion.aggregate({
    where: { jobTitleId: jobTitle.id },
    _max: { version: true },
  });
  const version = (maxVersion._max.version ?? 0) + 1;

  const run = await prisma.generationRun.create({
    data: {
      userId: session.user.id,
      jobTitleInput: positionName || jobTitle.name,
      status: "imported",
      promptVersion: "import-v1",
    },
  });

  const finalText = toPrintableText(payload);

  const created = await prisma.instructionVersion.create({
    data: {
      jobTitleId: jobTitle.id,
      generationRunId: run.id,
      version,
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

