import { prisma } from "@/lib/prisma";
import { LEGAL_ENTITIES, getLegalEntity, type LegalEntityId } from "@/lib/legal-entities";

export type DirectorRecord = {
  id: string;
  legalEntityId: string;
  fullName: string;
  isCurrent: boolean;
};

/**
 * При первом обращении переносит директоров из реестра в БД: у каждого юрлица
 * появляется запись с ФИО из кода, помеченная текущей. Дальше правки идут
 * только через админку, код остаётся лишь запасным вариантом.
 */
export async function ensureDirectorsSeeded(): Promise<void> {
  const existing = await prisma.director.findMany({ select: { legalEntityId: true } });
  const seeded = new Set(existing.map((d) => d.legalEntityId));

  const missing = LEGAL_ENTITIES.filter((entity) => !seeded.has(entity.id));
  if (!missing.length) return;

  await prisma.director.createMany({
    data: missing.map((entity) => ({
      legalEntityId: entity.id,
      fullName: entity.directorName,
      isCurrent: true,
    })),
  });
}

/**
 * ФИО действующего генерального директора юрлица для блока "УТВЕРЖДАЮ".
 * Если в БД записи нет (или все сняты с признака текущего) — берём из реестра.
 */
export async function getCurrentDirectorName(legalEntityId: string): Promise<string> {
  const fallback = getLegalEntity(legalEntityId).directorName;
  try {
    await ensureDirectorsSeeded();
    const current = await prisma.director.findFirst({
      where: { legalEntityId, isCurrent: true },
      select: { fullName: true },
    });
    return current?.fullName.trim() || fallback;
  } catch {
    // Экспорт документа не должен падать из-за недоступности справочника.
    return fallback;
  }
}

export async function listDirectors(): Promise<DirectorRecord[]> {
  await ensureDirectorsSeeded();
  return prisma.director.findMany({
    select: { id: true, legalEntityId: true, fullName: true, isCurrent: true },
    orderBy: [{ legalEntityId: "asc" }, { isCurrent: "desc" }, { fullName: "asc" }],
  });
}

/**
 * Добавляет директора юрлицу. makeCurrent=true сразу назначает его действующим.
 * Повторное добавление того же ФИО не создаёт дубль, а обновляет существующего.
 */
export async function addDirector(
  legalEntityId: LegalEntityId,
  fullName: string,
  makeCurrent: boolean,
): Promise<DirectorRecord> {
  const name = fullName.trim();
  await ensureDirectorsSeeded();

  return prisma.$transaction(async (tx) => {
    if (makeCurrent) {
      await tx.director.updateMany({ where: { legalEntityId }, data: { isCurrent: false } });
    }
    return tx.director.upsert({
      where: { legalEntityId_fullName: { legalEntityId, fullName: name } },
      create: { legalEntityId, fullName: name, isCurrent: makeCurrent },
      update: { isCurrent: makeCurrent },
      select: { id: true, legalEntityId: true, fullName: true, isCurrent: true },
    });
  });
}

/** Назначает директора действующим; у остальных по этому юрлицу признак снимается. */
export async function setCurrentDirector(id: string): Promise<DirectorRecord> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.director.findUniqueOrThrow({
      where: { id },
      select: { id: true, legalEntityId: true },
    });
    await tx.director.updateMany({
      where: { legalEntityId: target.legalEntityId },
      data: { isCurrent: false },
    });
    return tx.director.update({
      where: { id },
      data: { isCurrent: true },
      select: { id: true, legalEntityId: true, fullName: true, isCurrent: true },
    });
  });
}

/**
 * Удаляет директора из списка. Действующего удалить нельзя — иначе документы
 * останутся без подписи; сначала назначьте текущим кого-то другого.
 */
export async function deleteDirector(id: string): Promise<void> {
  const row = await prisma.director.findUniqueOrThrow({
    where: { id },
    select: { isCurrent: true },
  });
  if (row.isCurrent) throw new Error("current_director_cannot_be_deleted");
  await prisma.director.delete({ where: { id } });
}
