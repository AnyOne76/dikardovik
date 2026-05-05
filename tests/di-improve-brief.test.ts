import { describe, expect, it } from "vitest";
import { buildAnalyzeFeedbackBrief } from "@/lib/di-improve-from-feedback";

describe("buildAnalyzeFeedbackBrief", () => {
  it("объединяет замечания проверки и верификации", () => {
    const text = buildAnalyzeFeedbackBrief(
      [{ path: "sections.duties.items[0]", message: "Уточнить формулировку." }],
      {
        note: "Добавить про сметную документацию.",
        issues: [{ section: "duties", severity: "warning", message: "Упомянуть охрану окружающей среды." }],
      },
    );
    expect(text).toContain("ЕКС/ЕТКС");
    expect(text).toContain("сметную");
    expect(text).toContain("охрану окружающей");
    expect(text).toContain("sections.duties.items[0]");
  });
});
