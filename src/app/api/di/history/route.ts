import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const rows = await prisma.instructionVersion.findMany({
    where: isAdmin ? undefined : { generationRun: { userId: session.user.id } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { jobTitle: true },
  });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      title: r.jobTitle.name,
      version: r.version,
      createdAt: r.createdAt,
    })),
  );
}
