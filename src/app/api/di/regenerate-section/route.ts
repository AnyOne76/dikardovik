import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  REGENERATE_SECTION_KEYS,
  RegenerateSectionError,
  regenerateInstructionSection,
  type RegenerateSectionKey,
} from "@/lib/di-regenerate-section";
import { getClientIp } from "@/lib/request-meta";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({} as { id?: unknown; section?: unknown; templateJson?: unknown }));
  const id = String(body?.id || "").trim();
  const section = String(body?.section || "").trim() as RegenerateSectionKey;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (!REGENERATE_SECTION_KEYS.includes(section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  try {
    const templateJson = await regenerateInstructionSection({
      id,
      section,
      templateJson: body?.templateJson,
      userId: session.user.id,
      userRole: session.user.role ?? "hr",
      ip: getClientIp(request),
    });
    return NextResponse.json({ templateJson });
  } catch (error) {
    if (error instanceof RegenerateSectionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("regenerate-section failed", error);
    return NextResponse.json({ error: "Не удалось перегенерировать раздел" }, { status: 500 });
  }
}
