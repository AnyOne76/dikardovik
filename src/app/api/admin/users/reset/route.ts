import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  login: z.string().min(3),
  newPassword: z.string().min(6).optional(),
});

function generatePassword(len = 12): string {
  // URL-safe-ish alphabet to avoid whitespace; no need for unicode.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { login: parsed.data.login } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const providedPassword = parsed.data.newPassword?.trim();
  const finalPassword = providedPassword ? providedPassword : generatePassword(12);
  const hash = await bcrypt.hash(finalPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });

  // If password was generated (not provided), return it once so admin can copy it.
  if (providedPassword) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: true, password: finalPassword });
}

