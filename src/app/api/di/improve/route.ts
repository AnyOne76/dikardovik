import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getResolvedApiConfig } from "@/lib/api-settings";
import { assertStrictStructure, instructionSchema, type InstructionPayload } from "@/lib/di-contract";
import {
  extractInstructionFileText,
  isSupportedWordUploadName,
} from "@/lib/di-analyze";
import {
  buildAnalyzeFeedbackBrief,
  improveInstructionFromAnalyzeFeedback,
  type AnalyzeIssueLike,
  type ComplianceIssueLike,
} from "@/lib/di-improve-from-feedback";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function parseAnalyzeIssuesFromUnknown(raw: unknown): AnalyzeIssueLike[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => ({
    code: typeof (x as { code?: unknown }).code === "string" ? (x as { code: string }).code : undefined,
    message: String((x as { message?: unknown }).message ?? ""),
    path: typeof (x as { path?: unknown }).path === "string" ? (x as { path: string }).path : undefined,
  }));
}

function parseComplianceFromUnknown(raw: unknown): { note?: string; issues?: ComplianceIssueLike[] } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as { note?: unknown; issues?: unknown };
  const note = typeof c.note === "string" ? c.note : undefined;
  const issuesRaw = Array.isArray(c.issues) ? c.issues : [];
  return {
    note,
    issues: issuesRaw.map((i) => ({
      section: String((i as { section?: unknown }).section ?? "general"),
      severity: String((i as { severity?: unknown }).severity ?? "warning"),
      message: String((i as { message?: unknown }).message ?? ""),
    })),
  };
}

async function runImprove(
  payload: InstructionPayload,
  analyzeIssues: AnalyzeIssueLike[],
  compliance: { note?: string; issues?: ComplianceIssueLike[] } | undefined,
  sourceDocumentText: string | undefined,
) {
  const brief = buildAnalyzeFeedbackBrief(analyzeIssues, compliance);
  if (!brief.trim()) {
    return NextResponse.json(
      {
        error:
          "Нет текста замечаний. Отметьте проверку ЕКС/ЕТКС или дождитесь списка замечаний по формулировкам, затем повторите.",
      },
      { status: 400 },
    );
  }

  try {
    const resolved = await getResolvedApiConfig();
    const out = await improveInstructionFromAnalyzeFeedback(payload, brief, resolved, {
      sourceDocumentText,
    });
    return NextResponse.json({
      ok: true,
      payload: out.payload,
      printablePreview: out.printablePreview,
      model: out.model,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось доработать инструкцию";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`di-improve:${ip}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const rawTj = form.get("templateJson");
    if (typeof rawTj !== "string") {
      return NextResponse.json({ error: "templateJson field required" }, { status: 400 });
    }
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(rawTj);
    } catch {
      return NextResponse.json({ error: "Invalid templateJson JSON" }, { status: 400 });
    }
    let payload: InstructionPayload;
    try {
      payload = instructionSchema.parse(parsedPayload);
      assertStrictStructure(payload);
    } catch {
      return NextResponse.json({ error: "Invalid templateJson" }, { status: 400 });
    }

    const rawIssues = form.get("analyzeIssues");
    let analyzeIssues: AnalyzeIssueLike[] = [];
    if (typeof rawIssues === "string") {
      try {
        analyzeIssues = parseAnalyzeIssuesFromUnknown(JSON.parse(rawIssues));
      } catch {
        return NextResponse.json({ error: "Invalid analyzeIssues JSON" }, { status: 400 });
      }
    }

    let compliance: ReturnType<typeof parseComplianceFromUnknown> | undefined;
    const rawComp = form.get("compliance");
    if (typeof rawComp === "string" && rawComp.trim()) {
      try {
        compliance = parseComplianceFromUnknown(JSON.parse(rawComp));
      } catch {
        return NextResponse.json({ error: "Invalid compliance JSON" }, { status: 400 });
      }
    }

    let sourceDocumentText: string | undefined;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (!isSupportedWordUploadName(file.name)) {
        return NextResponse.json(
          { error: "unsupported_format", message: "Поддерживаются .doc и .docx." },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "file_too_large" }, { status: 400 });
      }
      try {
        sourceDocumentText = await extractInstructionFileText(buf, file.name);
      } catch (e) {
        console.error("improve: Word extract failed", e);
        return NextResponse.json(
          {
            error: "document_read_failed",
            message: "Не удалось прочитать файл для доработки по исходнику.",
          },
          { status: 400 },
        );
      }
    }

    return runImprove(payload, analyzeIssues, compliance, sourceDocumentText);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const templateJson = (body as { templateJson?: unknown })?.templateJson;
  let payload: InstructionPayload;
  try {
    payload = instructionSchema.parse(templateJson);
    assertStrictStructure(payload);
  } catch {
    return NextResponse.json({ error: "Invalid templateJson" }, { status: 400 });
  }

  const analyzeIssues = parseAnalyzeIssuesFromUnknown((body as { analyzeIssues?: unknown }).analyzeIssues);
  const compliance = parseComplianceFromUnknown((body as { compliance?: unknown }).compliance);
  const sd = (body as { sourceDocumentText?: unknown }).sourceDocumentText;
  const sourceDocumentText = typeof sd === "string" && sd.trim().length >= 20 ? sd : undefined;

  return runImprove(payload, analyzeIssues, compliance, sourceDocumentText);
}
