export const LEADERSHIP_NOTE_LINES = [
  "ПРИМЕЧАНИЕ: Объем ответственности определяется трудовым договором, должностной инструкцией и действующим законодательством РФ. Работник также несет персональную ответственность за решения, принятые в рамках своих полномочий.",
  "Может быть привлечен к ответственности в соответствии с трудовым, гражданским, административным или уголовным законодательством РФ в зависимости от характера и тяжести нарушения.",
];

export const LINEAR_NOTE_LINES = [
  "ПРИМЕЧАНИЕ: Может быть привлечен к ответственности в соответствии с трудовым, гражданским, административным или уголовным законодательством РФ в зависимости от характера и тяжести нарушения.",
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
