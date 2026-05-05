import { z } from "zod";
import { FIXED_SUBORDINATION_LINES, getFinalNoteLines } from "@/lib/di-rules";

export const fixedHeaders = {
  approve: "У Т В Е Р Ж Д А Ю",
  title: "Д О Л Ж Н О С Т Н А Я     И Н С Т Р У К Ц И Я",
  sec1: "1. ОБЩИЕ ПОЛОЖЕНИЯ",
  sec2: "2. ДОЛЖНОСТНЫЕ ОБЯЗАННОСТИ",
  sec3: "3. ПРАВА",
  sec4: "4. ОТВЕТСТВЕННОСТЬ",
} as const;

const sectionSchema = z.object({
  heading: z.string().min(3),
  items: z.array(z.string().min(2)).min(1),
});

const generalSectionSchema = z.object({
  heading: z.string().min(3),
  requiredQualification: z.array(z.string().min(2)).min(1),
  subordination: z.array(z.string().min(2)).min(1),
  hiringProcedure: z.array(z.string().min(2)).min(1),
  substitutionProcedure: z.array(z.string().min(2)).min(1),
  regulatoryDocuments: z.array(z.string().min(2)).min(1),
  localRegulations: z.array(z.string().min(2)).min(1),
  employeeMustKnow: z.array(z.string().min(2)).min(1),
});

export const instructionSchema = z.object({
  templateMeta: z.object({
    approvedBy: z.string().min(1),
    positionName: z.string().min(1),
    departmentName: z.string().min(1),
  }),
  sections: z.object({
    general: generalSectionSchema,
    duties: sectionSchema,
    rights: sectionSchema,
    responsibility: sectionSchema,
  }),
  signatures: z.object({
    coordinator: z.string().min(1),
    acknowledgementSlots: z.number().int().min(1).max(20),
  }),
});

export type InstructionPayload = z.infer<typeof instructionSchema>;

export function assertStrictStructure(payload: InstructionPayload) {
  const expected = [
    fixedHeaders.sec1,
    fixedHeaders.sec2,
    fixedHeaders.sec3,
    fixedHeaders.sec4,
  ];
  const actual = [
    payload.sections.general.heading,
    payload.sections.duties.heading,
    payload.sections.rights.heading,
    payload.sections.responsibility.heading,
  ];
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      throw new Error(`Нарушена структура шаблона DI в секции #${i + 1}.`);
    }
  }
}

export function toPrintableText(payload: InstructionPayload): string {
  const { templateMeta, sections, signatures } = payload;
  const fieldToText = (title: string, items: string[]) =>
    [title, ...items.map((item) => `- ${item}`)].join("\n");

  return [
    "Д О Л Ж Н О С Т Н А Я     И Н С Т Р У К Ц И Я",
    `Название штатной должности\t${templateMeta.positionName}`,
    `Наименование структурного подразделения\t${templateMeta.departmentName}`,
    "",
    sections.general.heading,
    fieldToText("Требуемая квалификация и стаж работы по данной должности", sections.general.requiredQualification),
    "",
    fieldToText("Подчиненность", FIXED_SUBORDINATION_LINES),
    "",
    fieldToText("Прием на работу", sections.general.hiringProcedure),
    "",
    fieldToText("Замещение на время отсутствия", sections.general.substitutionProcedure),
    "",
    fieldToText(
      "Нормативные документы, которыми руководствуется в своей деятельности",
      sections.general.regulatoryDocuments,
    ),
    "",
    fieldToText("Локально-нормативные акты", sections.general.localRegulations),
    "",
    fieldToText("Работник должен знать", sections.general.employeeMustKnow),
    "",
    sections.duties.heading,
    fieldToText("Работник обязан", sections.duties.items),
    "",
    sections.rights.heading,
    fieldToText("Работник имеет право", sections.rights.items),
    "",
    sections.responsibility.heading,
    fieldToText("Работник несет ответственность за", sections.responsibility.items),
    "",
    ...getFinalNoteLines(templateMeta.positionName),
    "",
    "Согласовано",
    signatures.coordinator,
    ...Array.from({ length: signatures.acknowledgementSlots }, (_, i) => {
      return `С должностной инструкцией ознакомлен(а) #${i + 1}: __________________`;
    }),
  ].join("\n");
}
