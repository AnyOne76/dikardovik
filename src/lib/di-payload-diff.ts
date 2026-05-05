import type { InstructionPayload } from "@/lib/di-contract";

export type InstructionFieldChange = { path: string; before: string; after: string };

function pushListDiff(out: InstructionFieldChange[], path: string, a: string[], b: string[]) {
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const sa = a[i] ?? "";
    const sb = b[i] ?? "";
    if (sa !== sb) {
      out.push({
        path: `${path} #${i + 1}`,
        before: sa.trim() ? sa : "—",
        after: sb.trim() ? sb : "—",
      });
    }
  }
}

/** Построчное сравнение полей payload (для показа после «Доработать по замечаниям»). */
export function listInstructionPayloadChanges(
  before: InstructionPayload,
  after: InstructionPayload,
): InstructionFieldChange[] {
  const out: InstructionFieldChange[] = [];
  if (before.templateMeta.approvedBy !== after.templateMeta.approvedBy) {
    out.push({
      path: "templateMeta.approvedBy",
      before: before.templateMeta.approvedBy,
      after: after.templateMeta.approvedBy,
    });
  }
  if (before.templateMeta.positionName !== after.templateMeta.positionName) {
    out.push({
      path: "templateMeta.positionName",
      before: before.templateMeta.positionName,
      after: after.templateMeta.positionName,
    });
  }
  if (before.templateMeta.departmentName !== after.templateMeta.departmentName) {
    out.push({
      path: "templateMeta.departmentName",
      before: before.templateMeta.departmentName,
      after: after.templateMeta.departmentName,
    });
  }

  const g0 = before.sections.general;
  const g1 = after.sections.general;
  pushListDiff(out, "general.requiredQualification", g0.requiredQualification, g1.requiredQualification);
  pushListDiff(out, "general.subordination", g0.subordination, g1.subordination);
  pushListDiff(out, "general.hiringProcedure", g0.hiringProcedure, g1.hiringProcedure);
  pushListDiff(out, "general.substitutionProcedure", g0.substitutionProcedure, g1.substitutionProcedure);
  pushListDiff(out, "general.regulatoryDocuments", g0.regulatoryDocuments, g1.regulatoryDocuments);
  pushListDiff(out, "general.localRegulations", g0.localRegulations, g1.localRegulations);
  pushListDiff(out, "general.employeeMustKnow", g0.employeeMustKnow, g1.employeeMustKnow);

  pushListDiff(out, "duties.items", before.sections.duties.items, after.sections.duties.items);
  pushListDiff(out, "rights.items", before.sections.rights.items, after.sections.rights.items);
  pushListDiff(
    out,
    "responsibility.items",
    before.sections.responsibility.items,
    after.sections.responsibility.items,
  );

  if (before.signatures.coordinator !== after.signatures.coordinator) {
    out.push({
      path: "signatures.coordinator",
      before: before.signatures.coordinator,
      after: after.signatures.coordinator,
    });
  }
  if (before.signatures.acknowledgementSlots !== after.signatures.acknowledgementSlots) {
    out.push({
      path: "signatures.acknowledgementSlots",
      before: String(before.signatures.acknowledgementSlots),
      after: String(after.signatures.acknowledgementSlots),
    });
  }
  return out;
}
