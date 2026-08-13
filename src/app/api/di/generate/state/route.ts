import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Состояние последней генерации пользователя.
 *
 * Генерация идёт одним длинным запросом, и её результат сохраняется в базу
 * независимо от того, дождался ли браузер ответа. Этот маршрут позволяет
 * вкладке, пережившей перезагрузку, снова прицепиться к своей генерации:
 * дорисовать шкалу, если она ещё идёт, или забрать готовый документ.
 */

/** Дольше этого «running» считаем зависшим: скорее всего, процесс перезапустили. */
const STALE_AFTER_MS = 20 * 60 * 1000;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const run = await prisma.generationRun.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  if (!run) return NextResponse.json({ state: "idle" });

  const age = Date.now() - run.createdAt.getTime();
  if (age > STALE_AFTER_MS) return NextResponse.json({ state: "idle" });

  if (run.status === "running") {
    return NextResponse.json({ state: "running", startedAt: run.createdAt.toISOString() });
  }

  if (run.status === "failed") {
    return NextResponse.json({
      state: "failed",
      error: run.errorMessage || "Не удалось сформировать документ.",
    });
  }

  const version = await prisma.instructionVersion.findFirst({
    where: { generationRunId: run.id },
    orderBy: { createdAt: "desc" },
  });
  if (!version) return NextResponse.json({ state: "idle" });

  return NextResponse.json({
    state: "done",
    id: version.id,
    version: version.version,
    payload: version.templateJson,
    finalText: version.finalText,
  });
}
