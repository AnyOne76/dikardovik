"use client";

import { useMemo, useState } from "react";
import { getFinalNoteLines } from "@/lib/di-rules";

const DEPARTMENTS = [
  "Административно-хозяйственная служба",
  "Департамент ритейла и франчайзинга",
  "Коммерческая служба",
  "Производственная служба",
  "Служба безопасности",
  "Служба главного инженера",
  "Служба интернет коммерции",
  "Служба информационных технологий",
  "Служба качества",
  "Служба контроля и ревизий",
  "Служба маркетинга и рекламы",
  "Служба персонала",
  "Служба по исследованию и разработке продукта",
  "Служба по охране труда и пожарной безопасности",
  "Служба по управлению цепями поставок",
  "Служба повышения производительности труда и эффективности",
  "Служба строительства и эксплуатации",
  "Финансово-Экономическая служба",
  "Юридическая служба",
];

type GenerateResponse = {
  id: string;
  version: number;
  finalText: string;
  payload: {
    templateMeta: {
      positionName: string;
      departmentName: string;
    };
    sections: {
      general: {
        heading: string;
        requiredQualification: string[];
        subordination: string[];
        hiringProcedure: string[];
        substitutionProcedure: string[];
        regulatoryDocuments: string[];
        localRegulations: string[];
        employeeMustKnow: string[];
      };
      duties: { heading: string; items: string[] };
      rights: { heading: string; items: string[] };
      responsibility: { heading: string; items: string[] };
    };
  };
};

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-zinc-700">
      {items.map((item, idx) => (
        <li key={`${idx}-${item.slice(0, 20)}`}>{item}</li>
      ))}
    </ol>
  );
}

function LabelRow({ label, items }: { label: string; items: string[] }) {
  return (
    <tr className="align-top">
      <td className="w-[34%] border border-orange-100 bg-orange-50/70 p-3 font-medium text-zinc-800">{label}</td>
      <td className="border border-orange-100 bg-white p-3">
        <NumberedList items={items} />
      </td>
    </tr>
  );
}

export default function HomePage() {
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("Служба строительства и эксплуатации");
  const [customDepartment, setCustomDepartment] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (jobTitle.trim().length <= 1) return false;
    if (department === "__custom__" && customDepartment.trim().length <= 2) return false;
    return true;
  }, [jobTitle, loading, department, customDepartment]);
  const selectedDepartment =
    department === "__custom__" ? customDepartment.trim() : department;

  async function generate() {
    setError("");
    setLoading(true);
    try {
      const resp = await fetch("/api/di/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, department: selectedDepartment }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ошибка генерации");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6 text-zinc-900">
      <section className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
              Генератор должностных инструкций
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">ООО МПЗ Мясницкий Ряд</p>
          </div>
          <a
            className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-white px-4 text-sm font-medium text-orange-700 transition hover:-translate-y-0.5 hover:bg-orange-50"
            href="/history"
          >
            История генераций
          </a>
        </div>
      </section>

      <div className="mt-6 grid gap-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">Параметры генерации</h2>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
            Шаблон фиксирован
          </span>
        </div>
        <input
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
          placeholder="Введите должность/специальность"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />
        <select
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          {DEPARTMENTS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          <option value="__custom__">Другое (ввести вручную)</option>
        </select>
        {department === "__custom__" && (
          <input
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
            placeholder="Введите новое структурное подразделение"
            value={customDepartment}
            onChange={(e) => setCustomDepartment(e.target.value)}
          />
        )}
        <button
          disabled={!canSubmit}
          onClick={generate}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 font-medium text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Генерация..." : "Сформировать DI"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      {result && (
        <section className="mt-6 rounded-2xl border border-orange-100 bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              Документ сформирован <span className="text-orange-700"># {result.version}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <a
                className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-medium text-orange-800 transition hover:bg-orange-100"
                href={`/api/di/export/${result.id}`}
              >
                Экспорт DOCX
              </a>
              <a
                className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-white px-4 text-sm font-medium text-orange-800 transition hover:bg-orange-50"
                href={`/history/${result.id}/edit`}
              >
                Открыть в редакторе
              </a>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-orange-100">
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr>
                  <td className="border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-3 text-center text-base font-bold tracking-[0.3em] text-zinc-800" colSpan={2}>
                    ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="w-[34%] border border-orange-100 bg-orange-50/70 p-3 font-medium">
                    Название штатной должности
                  </td>
                  <td className="border border-orange-100 p-3">{result.payload.templateMeta.positionName}</td>
                </tr>
                <tr className="align-top">
                  <td className="border border-orange-100 bg-orange-50/70 p-3 font-medium">
                    Наименование структурного подразделения
                  </td>
                  <td className="border border-orange-100 p-3">{result.payload.templateMeta.departmentName}</td>
                </tr>

                <tr>
                  <td className="border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-2.5 text-center font-bold text-zinc-800" colSpan={2}>
                    {result.payload.sections.general.heading}
                  </td>
                </tr>
                <LabelRow
                  label="Требуемая квалификация и стаж работы по данной должности"
                  items={result.payload.sections.general.requiredQualification}
                />
                <LabelRow label="Подчиненность" items={result.payload.sections.general.subordination} />
                <LabelRow label="Прием на работу" items={result.payload.sections.general.hiringProcedure} />
                <LabelRow
                  label="Замещение на время отсутствия"
                  items={result.payload.sections.general.substitutionProcedure}
                />
                <LabelRow
                  label="Нормативные документы, которыми руководствуется в своей деятельности"
                  items={result.payload.sections.general.regulatoryDocuments}
                />
                <LabelRow
                  label="Локально-нормативные акты"
                  items={result.payload.sections.general.localRegulations}
                />
                <LabelRow
                  label="Работник должен знать"
                  items={result.payload.sections.general.employeeMustKnow}
                />

                <tr>
                  <td className="border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-2.5 text-center font-bold text-zinc-800" colSpan={2}>
                    {result.payload.sections.duties.heading}
                  </td>
                </tr>
                <LabelRow label="Работник обязан" items={result.payload.sections.duties.items} />

                <tr>
                  <td className="border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-2.5 text-center font-bold text-zinc-800" colSpan={2}>
                    {result.payload.sections.rights.heading}
                  </td>
                </tr>
                <LabelRow label="Работник имеет право" items={result.payload.sections.rights.items} />

                <tr>
                  <td className="border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-2.5 text-center font-bold text-zinc-800" colSpan={2}>
                    {result.payload.sections.responsibility.heading}
                  </td>
                </tr>
                <LabelRow
                  label="Работник несет ответственность за"
                  items={result.payload.sections.responsibility.items}
                />
              </tbody>
            </table>
          </div>
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-4 text-sm text-zinc-700">
            {getFinalNoteLines(result.payload.templateMeta.positionName).map((line, idx) => (
              <p key={`${idx}-${line.slice(0, 20)}`} className={idx > 0 ? "mt-2" : ""}>
                {line}
              </p>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
