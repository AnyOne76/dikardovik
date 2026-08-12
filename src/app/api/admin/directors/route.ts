import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  addDirector,
  deleteDirector,
  listDirectors,
  setCurrentDirector,
} from "@/lib/directors";
import { LEGAL_ENTITY_IDS } from "@/lib/legal-entities";

const postSchema = z.object({
  legalEntityId: z.enum(LEGAL_ENTITY_IDS),
  fullName: z.string().trim().min(3).max(120),
  makeCurrent: z.boolean().default(true),
});

const patchSchema = z.object({ id: z.string().min(1) });
const deleteSchema = z.object({ id: z.string().min(1) });

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  return NextResponse.json({ directors: await listDirectors() });
}

/** Добавляет нового генерального директора юрлицу (по умолчанию — сразу действующим). */
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Укажите юрлицо и ФИО директора", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { legalEntityId, fullName, makeCurrent } = parsed.data;
  const director = await addDirector(legalEntityId, fullName, makeCurrent);
  return NextResponse.json({ ok: true, director });
}

/** Назначает существующего директора действующим по его юрлицу. */
export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  try {
    const director = await setCurrentDirector(parsed.data.id);
    return NextResponse.json({ ok: true, director });
  } catch {
    return NextResponse.json({ error: "Директор не найден" }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });

  try {
    await deleteDirector(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "current_director_cannot_be_deleted"
        ? "Нельзя удалить действующего директора — сначала назначьте другого."
        : "Директор не найден";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
