import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { assertStrictStructure, instructionSchema, toPrintableText } from "@/lib/di-contract";
import { fetchPerplexityFacts } from "@/lib/perplexity";
import { generateInstructionPayload } from "@/lib/openrouter";
import { normalizeJobTitle } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const allowed = checkRateLimit(`generate:${ip}`, 12, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many generation requests" }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const jobTitle = String(body.jobTitle || "").trim();
  const department = String(body.department || "Служба строительства и эксплуатации").trim();
  if (!jobTitle) {
    return NextResponse.json({ error: "jobTitle is required" }, { status: 400 });
  }

  const normalized = normalizeJobTitle(jobTitle);
  const related = await prisma.jobTitle.findMany({
    where: { normalized: { contains: normalized.split(" ")[0] || normalized } },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    take: 5,
  });

  const run = await prisma.generationRun.create({
    data: {
      userId: session.user.id,
      jobTitleInput: jobTitle,
      status: "running",
      promptVersion: "v1",
    },
  });

  try {
    let perplexity: { model: string; snippets: string[] } = { model: "unavailable", snippets: [] };
    try {
      perplexity = await fetchPerplexityFacts(jobTitle);
    } catch (factsError) {
      // External search must not break DI generation pipeline.
      console.warn("Facts collection failed, fallback to generation without facts", factsError);
    }

    const generated = await generateInstructionPayload({
      jobTitle,
      department,
      facts: perplexity.snippets.slice(0, 90),
      relatedContext: related.flatMap((r) => r.versions.map((v) => v.finalText.slice(0, 400))),
    });
    const parsed = instructionSchema.parse(generated.payload);
    assertStrictStructure(parsed);
    const finalText = toPrintableText(parsed);

    const title = await prisma.jobTitle.upsert({
      where: { normalized },
      update: {},
      create: { name: jobTitle, normalized, synonyms: "" },
    });
    const maxVersion = await prisma.instructionVersion.aggregate({
      where: { jobTitleId: title.id },
      _max: { version: true },
    });
    const version = (maxVersion._max.version ?? 0) + 1;

    const created = await prisma.instructionVersion.create({
      data: {
        jobTitleId: title.id,
        generationRunId: run.id,
        version,
        templateJson: parsed,
        finalText,
      },
    });

    await Promise.all(
      related.map((r) =>
        prisma.instructionLink.upsert({
          where: {
            sourceId_targetId: {
              sourceId: title.id,
              targetId: r.id,
            },
          },
          update: { weight: 0.7, relationType: "semantic_related" },
          create: {
            sourceId: title.id,
            targetId: r.id,
            relationType: "semantic_related",
            weight: 0.7,
          },
        }),
      ),
    );

    await prisma.generationRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        perplexityModel: perplexity.model === "unavailable" ? null : perplexity.model,
        openrouterModel: generated.model,
      },
    });

    return NextResponse.json({
      id: created.id,
      version: created.version,
      payload: parsed,
      finalText,
      perplexity: {
        model: perplexity.model,
        snippets: perplexity.snippets,
      },
      openrouter: {
        model: generated.model,
      },
    });
  } catch (error) {
    console.error("DI generation failed", error);
    await prisma.generationRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorMessage: "Internal generation error",
      },
    });
    return NextResponse.json(
      { error: "Не удалось сформировать документ. Попробуйте еще раз позже." },
      { status: 500 },
    );
  }
}
