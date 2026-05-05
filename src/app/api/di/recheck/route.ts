import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getResolvedApiConfig } from "@/lib/api-settings";
import { assertStrictStructure, instructionSchema, toPrintableText, type InstructionPayload } from "@/lib/di-contract";
import {
  checkComplianceEksEtks,
  extractInstructionFileText,
  isSupportedWordUploadName,
  verifyInstructionPayloadAgainstDocumentText,
  type AnalyzeIssue,
  type ComplianceReport,
} from "@/lib/di-analyze";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function dedupeAnalyzeIssues(issues: AnalyzeIssue[]): AnalyzeIssue[] {
  const seen = new Set<string>();
  const out: AnalyzeIssue[] = [];
  for (const i of issues) {
    const key = `${i.code}\u0000${i.path ?? ""}\u0000${i.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}

type RecheckJsonBody = {
  templateJson?: unknown;
  compliance?: boolean;
};

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`di-recheck:${ip}`, 15, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: InstructionPayload;
  let fileBuffer: Buffer | null = null;
  let fileName: string | null = null;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const raw = form.get("templateJson");
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "templateJson field required" }, { status: 400 });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid templateJson JSON" }, { status: 400 });
    }
    try {
      payload = instructionSchema.parse(parsed);
      assertStrictStructure(payload);
    } catch {
      return NextResponse.json({ error: "Invalid DI payload" }, { status: 400 });
    }

    const complianceFlag = form.get("compliance") === "1" || form.get("compliance") === "true";
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (!isSupportedWordUploadName(file.name)) {
        return NextResponse.json({ error: "unsupported_format" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "file_too_large" }, { status: 400 });
      }
      fileBuffer = buf;
      fileName = file.name;
    }

    return runRecheck(payload, complianceFlag, fileBuffer, fileName);
  }

  if (contentType.includes("application/json")) {
    let body: RecheckJsonBody;
    try {
      body = (await request.json()) as RecheckJsonBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    try {
      payload = instructionSchema.parse(body.templateJson);
      assertStrictStructure(payload);
    } catch {
      return NextResponse.json({ error: "Invalid DI payload" }, { status: 400 });
    }
    return runRecheck(payload, Boolean(body.compliance), null, null);
  }

  return NextResponse.json({ error: "Use multipart/form-data or application/json" }, { status: 400 });
}

async function runRecheck(
  payload: InstructionPayload,
  compliance: boolean,
  fileBuffer: Buffer | null,
  fileName: string | null,
) {
  const issues: AnalyzeIssue[] = [];
  let complianceReport: ComplianceReport | undefined;
  let verifyNote: string | null = null;

  const resolved = await getResolvedApiConfig();
  const apiKey = resolved.openrouterApiKey.trim();
  const model = resolved.openrouterModel;
  const verifyModel = (process.env.OPENROUTER_VERIFY_MODEL ?? "").trim() || model;

  if (fileBuffer && fileName) {
    if (!apiKey) {
      verifyNote = "Нет ключа OpenRouter — сверка с документом недоступна.";
    } else {
      try {
        const documentText = await extractInstructionFileText(fileBuffer, fileName);
        if (documentText.trim().length >= 20) {
          const verify = await verifyInstructionPayloadAgainstDocumentText(
            documentText,
            payload,
            apiKey,
            verifyModel,
          );
          issues.push(...verify.issues);
          if (verify.skipped) {
            verifyNote = "Двойная проверка не выполнена полностью — см. замечания выше.";
          }
        } else {
          verifyNote = "Текст из файла слишком короткий — сверка с документом пропущена.";
        }
      } catch (e) {
        verifyNote = `Не удалось прочитать файл для сверки: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  } else {
    verifyNote =
      "Сверка JSON с исходным Word не выполнялась: в блоке загрузки выберите тот же файл и снова нажмите «Проверить» на странице анализа, либо оставьте только проверку ЕКС/ЕТКС.";
  }

  if (compliance) {
    complianceReport = await checkComplianceEksEtks(payload);
  }

  return NextResponse.json({
    ok: true,
    issues: dedupeAnalyzeIssues(issues),
    compliance: complianceReport,
    printablePreview: toPrintableText(payload),
    verifyNote,
    model,
  });
}
