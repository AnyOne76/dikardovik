"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Item = { id: string; title: string; version: number; createdAt: string };

export default function HistoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(async () => {
    const r = await fetch("/api/di/history");
    const d = await r.json();
    if (Array.isArray(d)) setItems(d);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  function toggleOne(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      const next: Record<string, boolean> = {};
      for (const it of items) next[it.id] = true;
      setSelected(next);
    } else {
      setSelected({});
    }
  }

  const allSelected = items.length > 0 && items.every((it) => selected[it.id]);
  const someSelected = selectedIds.length > 0;

  async function deleteOne(id: string) {
    if (!confirm("Удалить эту запись из истории?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/di/history/${id}`, { method: "DELETE" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка удаления");
      setSelected((s) => {
        const { [id]: _, ...rest } = s;
        return rest;
      });
      await loadHistory();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    const n = selectedIds.length;
    if (!confirm(`Удалить выбранные записи (${n})?`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/di/history/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка удаления");
      setSelected({});
      await loadHistory();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6 text-zinc-900">
      <section className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
              Archive
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">История генераций</h1>
            <p className="mt-2 text-sm text-zinc-600">Быстрый доступ к последним версиям документов и экспорту в DOCX.</p>
          </div>
          <a
            href="/"
            className="inline-flex h-10 shrink-0 items-center rounded-xl border border-orange-200 bg-white px-4 text-sm font-medium text-orange-700 transition hover:-translate-y-0.5 hover:bg-orange-50"
          >
            На главную
          </a>
        </div>
      </section>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected && !allSelected;
              }}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            Выбрать все
          </label>
          {someSelected && (
            <button
              type="button"
              disabled={busy}
              onClick={deleteSelected}
              className="inline-flex h-10 items-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-800 transition hover:bg-red-100 disabled:opacity-50"
            >
              Удалить выбранные ({selectedIds.length})
            </button>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {items.length === 0 && (
          <p className="rounded-2xl border border-orange-100 bg-white p-6 text-center text-sm text-zinc-600 shadow-sm">
            История пуста. Сгенерируйте документ на главной странице.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-[0_6px_24px_rgba(0,0,0,0.05)]"
          >
            <input
              type="checkbox"
              className="size-4 shrink-0 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
              checked={!!selected[item.id]}
              onChange={() => toggleOne(item.id)}
              aria-label={`Выбрать ${item.title}`}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900">{item.title}</p>
              <p className="text-sm text-zinc-600">Версия {item.version}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <a
                href={`/api/di/export/${item.id}`}
                className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-medium text-orange-800 transition hover:bg-orange-100"
              >
                Скачать DOCX
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={() => deleteOne(item.id)}
                className="inline-flex h-10 items-center rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
