import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  APP_SETTINGS_ID,
  ensureAppSettingsRow,
  maskApiKey,
} from "@/lib/api-settings";
import { prisma } from "@/lib/prisma";

const putSchema = z.object({
  perplexityApiKey: z.string().optional(),
  openrouterApiKey: z.string().optional(),
  clearPerplexityKey: z.boolean().optional(),
  clearOpenrouterKey: z.boolean().optional(),
  perplexityModel: z.string().min(1).optional(),
  openrouterModel: z.string().min(1).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ensureAppSettingsRow();
  const row = await prisma.appSettings.findUniqueOrThrow({
    where: { id: APP_SETTINGS_ID },
  });

  const px = maskApiKey(row.perplexityApiKey);
  const or = maskApiKey(row.openrouterApiKey);

  return NextResponse.json({
    perplexityModel: row.perplexityModel,
    openrouterModel: row.openrouterModel,
    perplexityConfigured: px.configured,
    perplexityKeyMask: px.mask,
    openrouterConfigured: or.configured,
    openrouterKeyMask: or.mask,
  });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  await ensureAppSettingsRow();

  const d = parsed.data;
  const data: {
    perplexityApiKey?: string;
    openrouterApiKey?: string;
    perplexityModel?: string;
    openrouterModel?: string;
  } = {};

  if (d.clearPerplexityKey) data.perplexityApiKey = "";
  else if (d.perplexityApiKey !== undefined && d.perplexityApiKey.trim().length > 0) {
    data.perplexityApiKey = d.perplexityApiKey.trim();
  }

  if (d.clearOpenrouterKey) data.openrouterApiKey = "";
  else if (d.openrouterApiKey !== undefined && d.openrouterApiKey.trim().length > 0) {
    data.openrouterApiKey = d.openrouterApiKey.trim();
  }

  if (d.perplexityModel !== undefined) data.perplexityModel = d.perplexityModel.trim();
  if (d.openrouterModel !== undefined) data.openrouterModel = d.openrouterModel.trim();

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, message: "Нет изменений" });
  }

  await prisma.appSettings.update({
    where: { id: APP_SETTINGS_ID },
    data,
  });

  return NextResponse.json({ ok: true });
}
