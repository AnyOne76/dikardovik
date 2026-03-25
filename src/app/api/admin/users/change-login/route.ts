import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  login: z.string().min(3),
  newLogin: z.string().min(3),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { login: parsed.data.login } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (parsed.data.newLogin === parsed.data.login) return NextResponse.json({ ok: true });

  const existing = await prisma.user.findUnique({ where: { login: parsed.data.newLogin } });
  if (existing) return NextResponse.json({ error: "Login already exists" }, { status: 409 });

  await prisma.user.update({
    where: { id: user.id },
    data: { login: parsed.data.newLogin },
  });

  return NextResponse.json({ ok: true });
}

