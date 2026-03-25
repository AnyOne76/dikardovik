import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawIds =
    body && typeof body === "object" && "ids" in body && Array.isArray((body as { ids: unknown }).ids)
      ? (body as { ids: unknown[] }).ids
      : [];
  const ids = [...new Set(rawIds.filter((x): x is string => typeof x === "string" && x.length > 0))];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Укажите хотя бы один идентификатор" }, { status: 400 });
  }

  const isAdmin = session.user.role === "admin";
  const result = await prisma.instructionVersion.deleteMany({
    where: {
      id: { in: ids },
      ...(isAdmin ? {} : { generationRun: { userId: session.user.id } }),
    },
  });

  return NextResponse.json({ deleted: result.count });
}
