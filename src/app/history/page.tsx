"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, LinkButton, Notice, Page, PageHeader } from "@/components/ui";

type Item = { id: string; title: string; version: number; createdAt: string };

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    const r = await fetch("/api/di/history");
    const d = await r.json();
    if (Array.isArray(d)) setItems(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  function toggleOne(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function toggleAll(checked: boolean) {
    if (!checked) return setSelected({});
    const next: Record<string, boolean> = {};
    for (const it of items) next[it.id] = true;
    setSelected(next);
  }

  const allSelected = items.length > 0 && items.every((it) => selected[it.id]);
  const someSelected = selectedIds.length > 0;

  async function remove(ids: string[]) {
    setBusy(true);
    setError("");
    try {
      const single = ids.length === 1;
      const r = single
        ? await fetch(`/api/di/history/${ids[0]}`, { method: "DELETE" })
        : await fetch("/api/di/history/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids }),
          });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "Ошибка удаления");
      setSelected({});
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="История"
        subtitle="Сохранённые версии документов: скачивание в DOCX и правка по разделам."
        actions={
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-medium transition-colors hover:bg-[var(--background)]"
          >
            Новая инструкция
          </Link>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {/* Панель массовых действий всегда занимает место, чтобы список
          не сдвигался вверх-вниз при выделении записей. */}
      <div className="mb-3 flex h-10 items-center justify-between gap-3">
        {items.length > 0 ? (
          <>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300 accent-[var(--accent)]"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              Выбрать все
            </label>
            {someSelected && (
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Удалить выбранные записи (${selectedIds.length})?`)) void remove(selectedIds);
                }}
              >
                Удалить выбранные ({selectedIds.length})
              </Button>
            )}
          </>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-18 animate-pulse rounded-xl border border-[var(--border)] bg-white" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState>История пуста. Сформируйте документ на главной странице.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 rounded border-zinc-300 accent-[var(--accent)]"
                checked={!!selected[item.id]}
                onChange={() => toggleOne(item.id)}
                aria-label={`Выбрать ${item.title}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--foreground)]">{item.title}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Версия {item.version}
                  {item.createdAt && ` · ${formatDate(item.createdAt)}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <LinkButton href={`/api/di/export/${item.id}`} size="sm">
                  Скачать DOCX
                </LinkButton>
                <LinkButton href={`/history/${item.id}/edit`} size="sm">
                  Редактировать
                </LinkButton>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="text-[var(--muted)] hover:text-red-700"
                  onClick={() => {
                    if (confirm("Удалить эту запись из истории?")) void remove([item.id]);
                  }}
                >
                  Удалить
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
