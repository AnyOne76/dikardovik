import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  analyzeInstructionFromText,
  checkComplianceEksEtks,
  extractInstructionFileText,
  isSupportedWordUploadName,
} from "@/lib/di-analyze";
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
    if (!isSupportedWordUploadName(file.name)) {
      return NextResponse.json(
        {
          error: "unsupported_format",
          message: "Поддерживаются файлы Word в форматах .docx и .doc.",
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
      documentText = await extractInstructionFileText(buf, file.name);
    } catch (e) {
      console.error("Word file extract failed", e);
      return NextResponse.json(
        {
          error: "document_read_failed",
          message:
            "Не удалось прочитать файл Word. Убедитесь, что это настоящий .doc или .docx; при необходимости откройте в Word и сохраните заново.",
        },
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

  try {
    const result = await analyzeInstructionFromText(documentText);
    if (!compliance || !result.payload) {
      return NextResponse.json(result);
    }

    const report = await checkComplianceEksEtks(result.payload);
    return NextResponse.json({ ...result, compliance: report });
  } catch (e) {
    console.error("POST /api/di/analyze failed", e);
    return NextResponse.json(
      {
        error: "internal_error",
        message:
          e instanceof Error
            ? e.message
            : "Внутренняя ошибка сервера при анализе или проверке ЕКС/ЕТКС. Попробуйте снять галочку ЕКС/ЕТКС или пересохранить файл в .docx.",
      },
      { status: 500 },
    );
  }
}
