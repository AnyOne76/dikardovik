import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { assertStrictStructure, instructionSchema, type InstructionPayload } from "@/lib/di-contract";
import { exportInstructionToDocx } from "@/lib/docx-export";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-meta";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!checkRateLimit(`di-export-draft:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let payload: InstructionPayload;
  try {
    payload = instructionSchema.parse((body as { templateJson?: unknown }).templateJson);
    assertStrictStructure(payload);
  } catch {
    return NextResponse.json({ error: "Invalid DI payload" }, { status: 400 });
  }

  try {
    const buffer = await exportInstructionToDocx(payload);
    const bodyOut = new Uint8Array(buffer);
    const safeName = payload.templateMeta.positionName.replace(/[^\p{L}\p{N}\s_-]/gu, "_").trim() || "instrukciya";
    const filename = `${safeName}_proverka.docx`;

    return new NextResponse(bodyOut, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    console.error("export-draft failed", e);
    return NextResponse.json(
      { error: "export_failed", message: e instanceof Error ? e.message : "Не удалось сформировать DOCX." },
      { status: 500 },
    );
  }
}
