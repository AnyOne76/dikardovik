import { describe, expect, it } from "vitest";
import { instructionSchema } from "@/lib/di-contract";
import {
  patchEmptyInstructionLists,
  SCHEMA_LIST_FALLBACKS,
  SCHEMA_SCALAR_FALLBACKS,
} from "@/lib/di-rules";

describe("patchEmptyInstructionLists", () => {
  it("подставляет coordinator и templateMeta, если модель вернула пустые строки", () => {
    const raw = {
      templateMeta: { approvedBy: "", positionName: "Инженер", departmentName: "Цех" },
      sections: {
        general: {
          heading: "1. ОБЩИЕ ПОЛОЖЕНИЯ",
          requiredQualification: ["Среднее профильное образование."],
          subordination: ["Функциональная и административная", "Генеральному директору"],
          hiringProcedure: ["Прием по штату."],
          substitutionProcedure: ["Замещение назначенным лицом."],
          regulatoryDocuments: ["ТК РФ."],
          localRegulations: ["ЛНА компании."],
          employeeMustKnow: ["Охрана труда."],
        },
        duties: { heading: "2. ДОЛЖНОСТНЫЕ ОБЯЗАННОСТИ", items: ["Работать по заданию."] },
        rights: { heading: "3. ПРАВА", items: ["Требовать условия труда."] },
        responsibility: { heading: "4. ОТВЕТСТВЕННОСТЬ", items: ["Нести ответственность за качество."] },
      },
      signatures: { coordinator: "", acknowledgementSlots: 8 },
    };
    const patched = patchEmptyInstructionLists(raw);
    const parsed = instructionSchema.safeParse(patched);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.signatures.coordinator).toBe(SCHEMA_SCALAR_FALLBACKS.coordinator);
      expect(parsed.data.templateMeta.approvedBy).toBe(SCHEMA_SCALAR_FALLBACKS.approvedBy);
    }
  });

  it("заполняет пустой employeeMustKnow для прохождения zod", () => {
    const raw = {
      templateMeta: { approvedBy: "УТВ", positionName: "Инженер", departmentName: "Цех" },
      sections: {
        general: {
          heading: "1. ОБЩИЕ ПОЛОЖЕНИЯ",
          requiredQualification: ["Среднее профильное образование."],
          subordination: ["Функциональная и административная", "Генеральному директору"],
          hiringProcedure: ["Прием по штату."],
          substitutionProcedure: ["Замещение назначенным лицом."],
          regulatoryDocuments: ["ТК РФ."],
          localRegulations: ["ЛНА компании."],
          employeeMustKnow: [],
        },
        duties: { heading: "2. ДОЛЖНОСТНЫЕ ОБЯЗАННОСТИ", items: ["Работать по заданию."] },
        rights: { heading: "3. ПРАВА", items: ["Требовать условия труда."] },
        responsibility: { heading: "4. ОТВЕТСТВЕННОСТЬ", items: ["Нести ответственность за качество."] },
      },
      signatures: { coordinator: "Согласовано", acknowledgementSlots: 8 },
    };
    const patched = patchEmptyInstructionLists(raw);
    const parsed = instructionSchema.safeParse(patched);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sections.general.employeeMustKnow[0]).toBe(SCHEMA_LIST_FALLBACKS.employeeMustKnow);
    }
  });
});
