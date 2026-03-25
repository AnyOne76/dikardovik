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
