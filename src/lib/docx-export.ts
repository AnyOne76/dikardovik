import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { fixedHeaders, type InstructionPayload } from "@/lib/di-contract";
import { getResolvedApiConfig } from "@/lib/api-settings";
import { applyTripleTextQuality } from "@/lib/di-text-quality";
import {
  capitalizeListItems,
  ensureResponsibilityItems,
  FIXED_SUBORDINATION_LINES,
  getFinalNoteLines,
} from "@/lib/di-rules";

const FONT = "Times New Roman";
const FONT_SIZE = 20;
const PAGE_MARGIN = 1_134;
const PAGE_TOP_MARGIN = 567;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const LOGO_PATH = join(process.cwd(), "03 лого-контурный-3.png");

function para(
  text: string,
  options: {
    bold?: boolean;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    size?: number;
    after?: number;
    color?: string;
    italics?: boolean;
  } = {},
) {
  return new Paragraph({
    alignment: options.alignment ?? AlignmentType.LEFT,
    spacing: { before: 0, after: options.after ?? 0, line: 240 },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        italics: options.italics,
        color: options.color,
        font: FONT,
        size: options.size ?? FONT_SIZE,
      }),
    ],
  });
}

function numbered(items: string[]) {
  const normalized = capitalizeListItems(items);
  return normalized.length
    ? normalized.map((item, index) => para(`${index + 1}. ${item.trim()}`))
    : [para("—")];
}

/**
 * Разбиение текста ЛНА / «должен знать» как в корпоративном образце:
 * в основном по точке с запятой; запятые не режем (сохраняются «СНиП, СП» и т.д.).
 * Если в строке нет «;», но длинный «ком»-перечень — осторожный запасной split.
 */
function splitLnaEnumerationLine(raw: string): string[] {
  let t = String(raw ?? "").trim();
  if (!t) return [];
  t = t.replace(/^\d+\.\s*/, "");
  t = t.replace(/^работник\s+должен\s+знать:?\s*/i, "").trim();
  if (!t) return [];

  const finish = (s: string) =>
    s
      .replace(/\s+/g, " ")
      .replace(/[;\s]+$/g, "")
      .replace(/\.\s*$/g, "")
      .trim();

  let chunks = t
    .split(/\s*;\s*/)
    .map((x) => finish(x))
    .filter((x) => x.length >= 3);

  if (chunks.length === 1 && chunks[0].length > 160) {
    const c = chunks[0];
    const commas = (c.match(/,/g) ?? []).length;
    if (!raw.includes(";") && commas >= 5) {
      chunks = c
        .split(/,\s+/)
        .map((x) => finish(x))
        .filter((x) => x.length >= 15);
    }
  }

  const out: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > 320) {
      for (const part of chunk
        .split(/,\s+/)
        .map((x) => finish(x))
        .filter((x) => x.length >= 12)) {
        out.push(part);
      }
    } else {
      out.push(chunk);
    }
  }
  return out;
}

/** Одна строка таблицы «Локально-нормативные акты»: подзаголовок и нумерованный список как в шаблоне. */
function mergedLnaAndEmployeeMustKnowParagraphs(localRegs: string[], employeeMustKnow: string[]): Paragraph[] {
  const lna = localRegs.flatMap((s) => splitLnaEnumerationLine(String(s ?? "").trim()));
  const emk = employeeMustKnow.flatMap((s) => splitLnaEnumerationLine(String(s ?? "").trim()));
  const lines: string[] = [];
  const used = new Set<string>();
  const pushUnique = (arr: string[]) => {
    for (const line of arr) {
      const key = line.toLowerCase().replace(/\s+/g, " ").trim();
      if (used.has(key)) continue;
      used.add(key);
      lines.push(line);
    }
  };
  pushUnique(lna);
  pushUnique(emk);

  if (!lines.length) return [para("—")];

  const cap = capitalizeListItems(lines);
  const blocks: Paragraph[] = [para("Работник должен знать:", { bold: true, after: 40 })];
  for (let i = 0; i < cap.length; i += 1) {
    blocks.push(para(`${i + 1}. ${cap[i]!.trim()}`));
  }
  return blocks;
}

function cell(children: Paragraph[], options: { width?: number; shaded?: boolean } = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.shaded ? { fill: "F2F2F2" } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children,
  });
}

function labelValueRow(label: string, value: Paragraph[]) {
  return new TableRow({
    cantSplit: false,
    children: [cell([para(label, { bold: true, alignment: AlignmentType.CENTER })], { width: 32, shaded: true }), cell(value, { width: 68 })],
  });
}

function subordinationRow() {
  return new TableRow({
    cantSplit: false,
    children: [
      cell([para("Подчиненность", { bold: true, alignment: AlignmentType.CENTER })], { width: 32, shaded: true }),
      cell(
        [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: NO_BORDER,
              bottom: NO_BORDER,
              left: NO_BORDER,
              right: NO_BORDER,
              insideHorizontal: NO_BORDER,
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 68, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 0, bottom: 0, left: 0, right: 100 },
                    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER },
                    children: [para(FIXED_SUBORDINATION_LINES[0], { alignment: AlignmentType.CENTER })],
                  }),
                  new TableCell({
                    width: { size: 32, type: WidthType.PERCENTAGE },
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { top: 0, bottom: 0, left: 100, right: 100 },
                    borders: { top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER },
                    children: [para(FIXED_SUBORDINATION_LINES[1], { bold: true, alignment: AlignmentType.CENTER })],
                  }),
                ],
              }),
            ],
          }),
        ],
        { width: 68 },
      ),
    ],
  });
}

function sectionRow(title: string) {
  return new TableRow({
    cantSplit: false,
    children: [
      new TableCell({
        columnSpan: 2,
        shading: { fill: "F2F2F2" },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [para(title, { bold: true, alignment: AlignmentType.CENTER })],
      }),
    ],
  });
}

function brandHeader(logoData: Buffer | null) {
  const lineBorder = { style: BorderStyle.SINGLE, size: 8, color: "9B6A6A" };
  const logoChildren = logoData
    ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [
            new ImageRun({
              type: "png",
              data: logoData,
              transformation: { width: 95, height: 25 },
            }),
          ],
        }),
      ]
    : [
        para("Мясницкий", {
          alignment: AlignmentType.CENTER,
          color: "8ECAD4",
          italics: true,
          size: 18,
        }),
        para("Ряд", {
          alignment: AlignmentType.CENTER,
          color: "8ECAD4",
          italics: true,
          size: 18,
        }),
      ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 16, type: WidthType.PERCENTAGE },
            margins: { top: 0, bottom: 60, left: 0, right: 100 },
            borders: {
              top: NO_BORDER,
              left: NO_BORDER,
              right: NO_BORDER,
              bottom: lineBorder,
            },
            children: logoChildren,
          }),
          new TableCell({
            width: { size: 84, type: WidthType.PERCENTAGE },
            margins: { top: 180, bottom: 60, left: 100, right: 0 },
            borders: {
              top: NO_BORDER,
              left: NO_BORDER,
              right: NO_BORDER,
              bottom: lineBorder,
            },
            children: [
              para("ООО «МПЗ Мясницкий ряд», г. Одинцово. Московская область", {
                alignment: AlignmentType.CENTER,
                color: "808080",
                size: 28,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function acknowledgementBlock() {
  return [
    para("С должностной инструкцией ознакомлен(а) и согласен(на), второй экземпляр на руки получен", {
      after: 120,
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { top: 0, bottom: 180, left: 700, right: 100 },
              borders: {
                top: NO_BORDER,
                bottom: NO_BORDER,
                left: NO_BORDER,
                right: NO_BORDER,
              },
              children: [para("________________", { alignment: AlignmentType.LEFT })],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { top: 0, bottom: 180, left: 100, right: 700 },
              borders: {
                top: NO_BORDER,
                bottom: NO_BORDER,
                left: NO_BORDER,
                right: NO_BORDER,
              },
              children: [para("«____»________________20__г.", { alignment: AlignmentType.RIGHT })],
            }),
          ],
        }),
      ],
    }),
  ];
}

export async function exportInstructionToDocx(payload: InstructionPayload): Promise<Buffer> {
  const resolved = await getResolvedApiConfig();
  const safePayload = await applyTripleTextQuality(payload, { resolvedApi: resolved });
  const logoData = await readFile(LOGO_PATH).catch(() => null);
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: PAGE_TOP_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
            },
          },
        },
        headers: {
          default: new Header({
            children: [brandHeader(logoData)],
          }),
        },
        children: [
          para(fixedHeaders.approve, { alignment: AlignmentType.RIGHT, after: 160 }),
          para("Генеральный директор", { alignment: AlignmentType.RIGHT, after: 160 }),
          para("___________ Филиппов Д.С.", { alignment: AlignmentType.RIGHT, after: 160 }),
          para("«____» ___________________ 20__г.", { alignment: AlignmentType.RIGHT, after: 280 }),
          para(fixedHeaders.title, { bold: true, alignment: AlignmentType.CENTER, size: 28, after: 160 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              left: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              right: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
            },
            rows: [
              labelValueRow("Название штатной должности", [para(safePayload.templateMeta.positionName)]),
              labelValueRow("Наименование структурного подразделения", [para(safePayload.templateMeta.departmentName)]),
              sectionRow(safePayload.sections.general.heading),
              labelValueRow("Требуемая квалификация и стаж работы по данной должности", numbered(safePayload.sections.general.requiredQualification)),
              subordinationRow(),
              labelValueRow("Прием на работу", numbered(safePayload.sections.general.hiringProcedure)),
              labelValueRow("Замещение на время отсутствия", numbered(safePayload.sections.general.substitutionProcedure)),
              labelValueRow("Нормативные документы, которыми руководствуется в своей деятельности", numbered(safePayload.sections.general.regulatoryDocuments)),
              labelValueRow(
                "Локально-нормативные акты",
                mergedLnaAndEmployeeMustKnowParagraphs(
                  safePayload.sections.general.localRegulations,
                  safePayload.sections.general.employeeMustKnow,
                ),
              ),
              sectionRow(safePayload.sections.duties.heading),
              labelValueRow("Работник обязан", numbered(safePayload.sections.duties.items)),
              sectionRow(safePayload.sections.rights.heading),
              labelValueRow("Работник имеет право", numbered(safePayload.sections.rights.items)),
              sectionRow(safePayload.sections.responsibility.heading),
              labelValueRow("Работник несет ответственность за", numbered(ensureResponsibilityItems(safePayload.sections.responsibility.items, 14))),
            ],
          }),
          para("", { after: 160 }),
          ...getFinalNoteLines(safePayload.templateMeta.positionName).map((line) => para(line)),
          para("", { after: 160 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              left: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              right: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "808080" },
            },
            rows: [
              new TableRow({
                children: [
                  cell([para("Согласовано")], { width: 25, shaded: true }),
                  cell([para("фамилия")], { width: 25, shaded: true }),
                  cell([para("дата")], { width: 25, shaded: true }),
                  cell([para("подпись")], { width: 25, shaded: true }),
                ],
              }),
              new TableRow({
                children: [
                  cell([para(safePayload.signatures.coordinator)], { width: 25 }),
                  cell([para("")], { width: 25 }),
                  cell([para("")], { width: 25 }),
                  cell([para("")], { width: 25 }),
                ],
              }),
            ],
          }),
          para("", { after: 160 }),
          ...Array.from({ length: safePayload.signatures.acknowledgementSlots }, () => acknowledgementBlock()).flat(),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
