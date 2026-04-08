import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  login: z.string().min(3),
  password: z.string().min(6),
  inviteCode: z.string().min(1),
});

function inviteCodesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expectedRaw = process.env.REGISTRATION_INVITE_CODE;
  const expectedCode = expectedRaw?.trim() ?? "";
  if (expectedCode.length === 0) {
    return NextResponse.json({ error: "Регистрация отключена" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Некорректные данные",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const receivedCode = parsed.data.inviteCode.trim();
  if (!inviteCodesMatch(expectedCode, receivedCode)) {
    return NextResponse.json({ error: "Неверный код приглашения" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { login: parsed.data.login } });
  if (existing) {
    return NextResponse.json({ error: "Пользователь с таким логином уже существует" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      login: parsed.data.login,
      passwordHash,
      role: "hr",
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
