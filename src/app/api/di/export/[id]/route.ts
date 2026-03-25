import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { exportInstructionToDocx } from "@/lib/docx-export";
import { instructionSchema } from "@/lib/di-contract";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await prisma.instructionVersion.findUnique({
    where: { id },
    include: { jobTitle: true, generationRun: { select: { userId: true } } },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.role === "admin";
  const isOwner = row.generationRun?.userId === session.user.id;
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = instructionSchema.parse(row.templateJson);
  const buffer = await exportInstructionToDocx(payload);
  // Next.js types for NextResponse body are stricter in some TS configs.
  // Convert Node Buffer -> Uint8Array to satisfy BodyInit.
  const body = new Uint8Array(buffer);
  const safeName = row.jobTitle.name.replace(/[^\p{L}\p{N}\s_-]/gu, "_");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}_v${row.version}.docx`)}`,
    },
  });
}
