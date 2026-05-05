export const LEADERSHIP_NOTE_LINES = [
  "ПРИМЕЧАНИЕ: Объем ответственности определяется трудовым договором, должностной инструкцией и действующим законодательством РФ. Работник также несет персональную ответственность за решения, принятые в рамках своих полномочий.",
  "Может быть привлечен к ответственности в соответствии с трудовым, гражданским, административным или уголовным законодательством РФ в зависимости от характера и тяжести нарушения.",
];

export const LINEAR_NOTE_LINES = [
  "ПРИМЕЧАНИЕ: Может быть привлечен к ответственности в соответствии с трудовым, гражданским, административным или уголовным законодательством РФ в зависимости от характера и тяжести нарушения.",
];

export const FIXED_SUBORDINATION_LINES = ["Функциональная и административная", "Генеральному директору"];

/** Нейтральные строки, если список пустой или все пункты короче 2 символов (zod .min(2)). */
export const SCHEMA_LIST_FALLBACKS = {
  requiredQualification: "Квалификационные требования определяются работодателем.",
  hiringProcedure:
    "Работник назначается на должность и освобождается от должности в установленном порядке действующим трудовым законодательством и приказом генерального директора организации",
  substitutionProcedure: "На время отсутствия обязанности исполняет назначенное лицо.",
  regulatoryDocuments: "Руководствуется ТК РФ, отраслевыми нормами и внутренними регламентами.",
  localRegulations: "Исполняет внутренние локально-нормативные акты компании.",
  employeeMustKnow:
    "Профильные стандарты, требования охраны труда и порядок документооборота в компании.",
  duties: "Выполнять должностные обязанности согласно утвержденным ЛНА.",
  rights: "Иметь право на условия и ресурсы, необходимые для безопасной работы.",
} as const;

/** Непустые строки для полей схемы (модель иногда отдаёт "" или поле опускает). */
export const SCHEMA_SCALAR_FALLBACKS = {
  approvedBy: "Генеральный директор __________________",
  positionName: "Наименование должности не указано",
  departmentName: "Наименование подразделения не указано",
  coordinator: "Согласовано: __________________",
} as const;

export function coerceNonEmptyScalar(value: unknown, fallback: string): string {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : fallback;
}

export function coerceAcknowledgementSlots(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 20) return 8;
  return Math.trunc(n);
}

export function coerceInstructionListItems(items: string[] | undefined, fallback: string): string[] {
  const v = (items ?? []).map((s) => String(s).trim()).filter((s) => s.length >= 2);
  return v.length > 0 ? v : [fallback];
}

/**
 * Восстанавливает пустые списки в черновике извлечённого JSON (модель могла вернуть []),
 * чтобы прошла схема instructionSchema и не блокировался импорт в редактор.
 */
export function patchEmptyInstructionLists(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const clone = structuredClone(data) as Record<string, unknown>;

  let templateMeta = clone.templateMeta as Record<string, unknown> | undefined;
  if (!templateMeta || typeof templateMeta !== "object") {
    templateMeta = {};
    clone.templateMeta = templateMeta;
  }
  templateMeta.approvedBy = coerceNonEmptyScalar(templateMeta.approvedBy, SCHEMA_SCALAR_FALLBACKS.approvedBy);
  templateMeta.positionName = coerceNonEmptyScalar(templateMeta.positionName, SCHEMA_SCALAR_FALLBACKS.positionName);
  templateMeta.departmentName = coerceNonEmptyScalar(
    templateMeta.departmentName,
    SCHEMA_SCALAR_FALLBACKS.departmentName,
  );

  let signatures = clone.signatures as Record<string, unknown> | undefined;
  if (!signatures || typeof signatures !== "object") {
    signatures = {};
    clone.signatures = signatures;
  }
  signatures.coordinator = coerceNonEmptyScalar(signatures.coordinator, SCHEMA_SCALAR_FALLBACKS.coordinator);
  signatures.acknowledgementSlots = coerceAcknowledgementSlots(signatures.acknowledgementSlots);

  const sections = clone.sections as Record<string, unknown> | undefined;
  if (!sections) return clone;

  const general = sections.general as Record<string, unknown> | undefined;
  if (general) {
    general.requiredQualification = coerceInstructionListItems(
      general.requiredQualification as string[] | undefined,
      SCHEMA_LIST_FALLBACKS.requiredQualification,
    );
    general.hiringProcedure = coerceInstructionListItems(
      general.hiringProcedure as string[] | undefined,
      SCHEMA_LIST_FALLBACKS.hiringProcedure,
    );
    general.substitutionProcedure = coerceInstructionListItems(
      general.substitutionProcedure as string[] | undefined,
      SCHEMA_LIST_FALLBACKS.substitutionProcedure,
    );
    general.regulatoryDocuments = coerceInstructionListItems(
      general.regulatoryDocuments as string[] | undefined,
      SCHEMA_LIST_FALLBACKS.regulatoryDocuments,
    );
    general.localRegulations = coerceInstructionListItems(
      general.localRegulations as string[] | undefined,
      SCHEMA_LIST_FALLBACKS.localRegulations,
    );
    general.employeeMustKnow = coerceInstructionListItems(
      general.employeeMustKnow as string[] | undefined,
      SCHEMA_LIST_FALLBACKS.employeeMustKnow,
    );
    general.subordination = [...FIXED_SUBORDINATION_LINES];
  }

  const duties = sections.duties as Record<string, unknown> | undefined;
  if (duties && duties.items !== undefined) {
    duties.items = coerceInstructionListItems(duties.items as string[] | undefined, SCHEMA_LIST_FALLBACKS.duties);
  }
  const rights = sections.rights as Record<string, unknown> | undefined;
  if (rights && rights.items !== undefined) {
    rights.items = coerceInstructionListItems(rights.items as string[] | undefined, SCHEMA_LIST_FALLBACKS.rights);
  }
  const responsibility = sections.responsibility as Record<string, unknown> | undefined;
  if (responsibility && responsibility.items !== undefined) {
    responsibility.items = coerceInstructionListItems(
      responsibility.items as string[] | undefined,
      RESPONSIBILITY_FALLBACK_ITEMS[0],
    );
  }
  return clone;
}

export const RESPONSIBILITY_FALLBACK_ITEMS = [
  "Качество и своевременность выполнения возложенных должностных обязанностей",
  "Соблюдение требований охраны труда, техники безопасности и пожарной безопасности",
  "Соблюдение правил внутреннего трудового распорядка и трудовой дисциплины",
  "Сохранность вверенного имущества, оборудования, материалов и документации",
  "Достоверность предоставляемой информации, отчетов и производственных данных",
  "Нарушение технологических процессов, регламентов и внутренних стандартов компании",
  "Причинение материального ущерба работодателю по своей вине",
  "Несвоевременное информирование руководителя о выявленных нарушениях, рисках и неисправностях",
  "Невыполнение распоряжений непосредственного руководителя в пределах должностных обязанностей",
  "Разглашение конфиденциальной информации и сведений, составляющих коммерческую тайну",
  "Нарушение порядка использования инструментов, оборудования и средств индивидуальной защиты",
  "Несоблюдение требований локально-нормативных актов и настоящей должностной инструкции",
  "Нарушение сроков выполнения порученных работ и производственных заданий",
  "Создание аварийных ситуаций или угрозы безопасности работников и имущества компании",
];

export function isLeadershipRole(jobTitle: string): boolean {
  const t = jobTitle.toLowerCase();
  return (
    t.includes("директор") ||
    t.includes("руководител") ||
    t.includes("начальник") ||
    t.includes("head") ||
    t.includes("chief")
  );
}

export function isDirectorRole(jobTitle: string): boolean {
  return jobTitle.toLowerCase().includes("директор");
}

export function getFinalNoteLines(jobTitle: string): string[] {
  return isLeadershipRole(jobTitle) ? LEADERSHIP_NOTE_LINES : LINEAR_NOTE_LINES;
}

export function isTailNoteLine(line: string): boolean {
  const normalized = line.trim();
  return (
    normalized.startsWith("ПРИМЕЧАНИЕ:") ||
    normalized.startsWith("ПРИМИЧАНИЕ:") ||
    normalized.startsWith("Может быть привлечен к ответственности")
  );
}

// "Ответственность" нельзя заполнять пунктами из других секций (квалификация/образование/прием и т.п.).
// Такие фрагменты иногда попадают в list из-за общего пула фактов для pad/trim.
export function isResponsibilityNoiseLine(line: string): boolean {
  const s = String(line ?? "").toLowerCase();
  if (!s.trim()) return false;

  return (
    /требуем(ая|ый)\s+квалификац(ия|ионн)/i.test(s) ||
    /стаж\s+работ/i.test(s) ||
    /общее\s+средн(ее|его)\s+образован/i.test(s) ||
    /образован(ие|ня)/i.test(s) ||
    /подчиненн(ость|ому|ым|ого|ые)/i.test(s) ||
    /прием\s+на\s+работу/i.test(s) ||
    /замещен(ие|ия)\s+на\s+время/i.test(s) ||
    /нормативн(ые|ые\s+документ)/i.test(s) ||
    /локально[-\s]*нормативн(ые|ых|ого)/i.test(s)
  );
}

// Для секции "Ответственность" принимаем только профильные формулировки.
// Это защищает от попадания строк из "Общих положений" и служебных фраз.
export function isResponsibilityRelevantLine(line: string): boolean {
  const s = String(line ?? "").toLowerCase().trim();
  if (!s) return false;
  if (isTailNoteLine(s) || isResponsibilityNoiseLine(s)) return false;

  const topicalPatterns: RegExp[] = [
    /ответственност/i,
    /нести\s+ответственност/i,
    /привлечен\s+к\s+ответственност/i,
    /нарушени/i,
    /ущерб/i,
    /убытк/i,
    /срок(ов|и)?\s+выполнени/i,
    /качест(во|ва)\s+выполнени/i,
    /сохранност/i,
    /разглашени/i,
    /конфиденциал/i,
    /охрана\s+труд/i,
    /пожарн(ой|ая)\s+безопасност/i,
    /трудов(ой|ого)\s+дисциплин/i,
  ];

  return topicalPatterns.some((re) => re.test(s));
}

export function ensureResponsibilityItems(items: string[], minCount = 14): string[] {
  const cleaned = (items ?? [])
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .filter((line) => !isTailNoteLine(line))
    .filter((line) => !isResponsibilityNoiseLine(line));
  const merged = [...cleaned, ...RESPONSIBILITY_FALLBACK_ITEMS].filter(
    (line, index, arr) => arr.indexOf(line) === index,
  );
  return merged.slice(0, Math.max(minCount, cleaned.length || minCount));
}

export function capitalizeListItem(item: string): string {
  const text = String(item ?? "").trim();
  const match = text.match(/^(\s*)([\p{L}])/u);
  if (!match?.[2]) return text;
  const index = match[1].length;
  return `${text.slice(0, index)}${text[index].toLocaleUpperCase("ru-RU")}${text.slice(index + 1)}`;
}

export function capitalizeListItems(items: string[]): string[] {
  return (items ?? []).map(capitalizeListItem);
}
