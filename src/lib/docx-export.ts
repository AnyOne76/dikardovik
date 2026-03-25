import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { fixedHeaders, type InstructionPayload } from "@/lib/di-contract";
import { getFinalNoteLines } from "@/lib/di-rules";

export async function exportInstructionToDocx(payload: InstructionPayload): Promise<Buffer> {
  const para = (text: string, bold = false, center = false) =>
    new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text, bold })],
    });

  const numbered = (items: string[]) =>
    items.map((item, idx) => para(`${idx + 1}. ${item}`));

  const sectionRow = (title: string) =>
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 2,
          children: [para(title, true, true)],
        }),
      ],
    });

  const labelValueRow = (label: string, valueParagraphs: Paragraph[]) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 40, type: WidthType.PERCENTAGE },
          children: [para(label)],
        }),
        new TableCell({
          width: { size: 60, type: WidthType.PERCENTAGE },
          children: valueParagraphs.length ? valueParagraphs : [para("—")],
        }),
      ],
    });

  const doc = new Document({
    sections: [
      {
        children: [
          para(fixedHeaders.title, true, true),
          para(""),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              labelValueRow("Название штатной должности", [para(payload.templateMeta.positionName)]),
              labelValueRow("Наименование структурного подразделения", [
                para(payload.templateMeta.departmentName),
              ]),
              sectionRow(payload.sections.general.heading),
              labelValueRow(
                "Требуемая квалификация и стаж работы по данной должности",
                numbered(payload.sections.general.requiredQualification),
              ),
              labelValueRow("Подчиненность", numbered(payload.sections.general.subordination)),
              labelValueRow("Прием на работу", numbered(payload.sections.general.hiringProcedure)),
              labelValueRow(
                "Замещение на время отсутствия",
                numbered(payload.sections.general.substitutionProcedure),
              ),
              labelValueRow(
                "Нормативные документы, которыми руководствуется в своей деятельности",
                numbered(payload.sections.general.regulatoryDocuments),
              ),
              labelValueRow("Локально-нормативные акты", numbered(payload.sections.general.localRegulations)),
              labelValueRow("Работник должен знать", numbered(payload.sections.general.employeeMustKnow)),
              sectionRow(payload.sections.duties.heading),
              labelValueRow("Работник обязан", numbered(payload.sections.duties.items)),
              sectionRow(payload.sections.rights.heading),
              labelValueRow("Работник имеет право", numbered(payload.sections.rights.items)),
              sectionRow(payload.sections.responsibility.heading),
              labelValueRow("Работник несет ответственность за", numbered(payload.sections.responsibility.items)),
            ],
          }),
          para(""),
          ...getFinalNoteLines(payload.templateMeta.positionName).map((line) => para(line)),
          para(""),
          para("Согласовано"),
          para(payload.signatures.coordinator),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
