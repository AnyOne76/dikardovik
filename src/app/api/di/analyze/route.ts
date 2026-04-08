import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { analyzeInstructionFromText, checkComplianceEksEtks, extractDocxText } from "@/lib/di-analyze";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIN_TEXT_CHARS = 20;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const allowed = checkRateLimit(`analyze:${ip}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";
  let documentText: string;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
      return NextResponse.json(
        {
          error: "unsupported_format",
          message:
            "Файлы .doc не поддерживаются. Откройте документ в Word и сохраните как .docx, затем загрузите снова.",
        },
        { status: 400 },
      );
    }
    if (!lower.endsWith(".docx")) {
      return NextResponse.json(
        {
          error: "unsupported_format",
          message: "Поддерживается только загрузка файлов в формате .docx.",
        },
        { status: 400 },
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "file_too_large", message: "Максимальный размер файла 10 МБ." },
        { status: 400 },
      );
    }
    try {
      documentText = await extractDocxText(buf);
    } catch (e) {
      console.error("DOCX extract failed", e);
      return NextResponse.json(
        { error: "docx_read_failed", message: "Не удалось прочитать DOCX." },
        { status: 400 },
      );
    }
  } else if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text : "";
    if (!text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    documentText = text;
  } else {
    return NextResponse.json(
      { error: "Expected multipart/form-data with file or application/json with { text }" },
      { status: 400 },
    );
  }

  if (documentText.trim().length < MIN_TEXT_CHARS) {
    return NextResponse.json(
      {
        error: "document_empty",
        message: "Текст документа слишком короткий или пустой.",
      },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const compliance = url.searchParams.get("compliance") === "1";

  const result = await analyzeInstructionFromText(documentText);
  if (!compliance || !result.ok || !result.payload) {
    return NextResponse.json(result);
  }

  const report = await checkComplianceEksEtks(result.payload);
  return NextResponse.json({ ...result, compliance: report });
}
