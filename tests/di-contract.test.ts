import { describe, expect, it } from "vitest";
import { assertStrictStructure, fixedHeaders, instructionSchema } from "../src/lib/di-contract";

describe("DI contract", () => {
  it("accepts valid strict structure", () => {
    const payload = instructionSchema.parse({
      templateMeta: {
        approvedBy: "Генеральный директор",
        positionName: "Водитель",
        departmentName: "Автоколонна",
      },
      sections: {
        general: {
          heading: fixedHeaders.sec1,
          requiredQualification: ["Пункт 1"],
          subordination: ["Пункт 2"],
          hiringProcedure: ["Пункт 3"],
          substitutionProcedure: ["Пункт 4"],
          regulatoryDocuments: ["Пункт 5"],
          localRegulations: ["Пункт 6"],
          employeeMustKnow: ["Пункт 7"],
        },
        duties: { heading: fixedHeaders.sec2, items: ["Пункт 2"] },
        rights: { heading: fixedHeaders.sec3, items: ["Пункт 3"] },
        responsibility: { heading: fixedHeaders.sec4, items: ["Пункт 4"] },
      },
      signatures: {
        coordinator: "Директор",
        acknowledgementSlots: 5,
      },
    });
    expect(() => assertStrictStructure(payload)).not.toThrow();
  });

  it("throws if section header order changed", () => {
    const payload = instructionSchema.parse({
      templateMeta: {
        approvedBy: "Генеральный директор",
        positionName: "Водитель",
        departmentName: "Автоколонна",
      },
      sections: {
        general: {
          heading: fixedHeaders.sec2,
          requiredQualification: ["Пункт 1"],
          subordination: ["Пункт 2"],
          hiringProcedure: ["Пункт 3"],
          substitutionProcedure: ["Пункт 4"],
          regulatoryDocuments: ["Пункт 5"],
          localRegulations: ["Пункт 6"],
          employeeMustKnow: ["Пункт 7"],
        },
        duties: { heading: fixedHeaders.sec1, items: ["Пункт 2"] },
        rights: { heading: fixedHeaders.sec3, items: ["Пункт 3"] },
        responsibility: { heading: fixedHeaders.sec4, items: ["Пункт 4"] },
      },
      signatures: {
        coordinator: "Директор",
        acknowledgementSlots: 5,
      },
    });
    expect(() => assertStrictStructure(payload)).toThrow();
  });
});
