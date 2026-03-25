import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  login: z.string().min(3),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { login: parsed.data.login } });
  if (existing) return NextResponse.json({ error: "User with this login already exists" }, { status: 409 });

  const hash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.user.create({
    data: {
      login: parsed.data.login,
      passwordHash: hash,
      role: "hr",
    },
  });

  return NextResponse.json({ ok: true });
}

