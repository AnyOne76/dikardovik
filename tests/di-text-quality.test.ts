import { describe, expect, it } from "vitest";
import { sanitizeInstructionSurfaceText } from "@/lib/di-text-quality";

describe("sanitizeInstructionSurfaceText", () => {
  it("нормализует пробелы перед знаками препинания и исправляет типовые опечатки", () => {
    expect(sanitizeInstructionSurfaceText("примичание : тест")).toMatch(/^ПРИМЕЧАНИЕ: тест$/);
    expect(sanitizeInstructionSurfaceText("слово  ,другое")).toBe("слово, другое");
  });
});
