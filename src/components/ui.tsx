"use client";

import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Общие элементы интерфейса. Все страницы собираются из них, чтобы отступы,
 * скругления, состояния фокуса и высота полей совпадали везде.
 */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- поверхности */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cx(
        "rounded-xl border border-zinc-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_8px_24px_-12px_rgba(16,24,40,0.12)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-zinc-900">{children}</h2>
      {hint && <p className="mt-1 text-sm text-zinc-500">{hint}</p>}
    </div>
  );
}

/** Заголовок страницы: название слева, действия справа. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Обёртка содержимого страницы с постоянной шириной колонки. */
export function Page({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: "narrow" | "wide" | "full";
}) {
  // "full" — для страниц с документом: таблице ДИ нужна ширина, иначе пункты
  // рвутся на обрывки. Верхняя граница не даёт строкам расползтись на всю
  // ширину большого монитора.
  const max = width === "narrow" ? "max-w-2xl" : width === "full" ? "max-w-[1600px]" : "max-w-6xl";
  return <main className={cx("mx-auto w-full px-4 py-8 sm:px-6", max)}>{children}</main>;
}

/* ------------------------------------------------------------------- элементы */

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55";

const buttonVariants = {
  primary: "bg-orange-600 text-white shadow-sm hover:bg-orange-700 active:bg-orange-800",
  secondary: "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
  ghost: "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
} as const;

const buttonSizes = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  loading?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** Ссылка, оформленная как кнопка (для скачивания и переходов). */
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: {
  href: string;
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  className?: string;
  children: ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], className)} {...rest}>
      {children}
    </a>
  );
}

/**
 * Шкала ожидания для запросов к модели. Реального прогресса она не сообщает,
 * поэтому полоса — оценка по времени: растёт быстро вначале и асимптотически
 * подходит к 95 %. Оставшееся закрывает только пришедший ответ, иначе полоса
 * упиралась бы в 100 % и продолжала висеть.
 *
 * `tau` — характерное время ответа в секундах: за него шкала доходит до ~60 %.
 * `stages` задаёт подписи этапов по возрастанию секунд.
 */
export function TimedProgress({
  tau = 30,
  stages,
  compact = false,
  startedAtMs,
  className,
}: {
  tau?: number;
  stages?: { until: number; label: string }[];
  compact?: boolean;
  /** Момент начала работы. Нужен, когда страницу перезагрузили посреди процесса:
   *  отсчёт должен продолжиться, а не начаться заново. */
  startedAtMs?: number;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = startedAtMs ?? Date.now();
    const tick = () => setElapsed((Date.now() - start) / 1000);
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [startedAtMs]);

  const percent = 95 * (1 - Math.exp(-elapsed / tau));
  const stage = stages?.find((s) => elapsed < s.until)?.label ?? stages?.[stages.length - 1]?.label;

  return (
    <div className={cx("w-full", className)}>
      {(stage || !compact) && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className={cx("font-medium text-zinc-900", compact ? "text-xs" : "text-sm")}>{stage}</p>
          <p className={cx("tabular-nums text-zinc-500", compact ? "text-xs" : "text-sm")}>{Math.round(percent)}%</p>
        </div>
      )}
      <div
        className={cx("overflow-hidden rounded-full bg-zinc-200", compact ? "h-1" : "h-2")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Готовность"
      >
        <div
          className="h-full rounded-full bg-orange-600 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      {!compact && (
        <p className="mt-2.5 tabular-nums text-xs text-zinc-500">
          Прошло {Math.floor(elapsed)} с · обычно 30–90 с. Не закрывайте страницу.
        </p>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("size-4 animate-spin", className)} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const fieldBase =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:bg-zinc-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldBase, "h-10", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, "h-10", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, "py-2.5 leading-relaxed", className)} {...rest} />;
}

/** Подпись + поле + подсказка одним блоком, чтобы вертикальный ритм не плавал. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-900">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        tone === "accent"
          ? "bg-orange-50 text-orange-700"
          : "bg-zinc-50 text-zinc-500",
      )}
    >
      {children}
    </span>
  );
}

/** Сообщение об ошибке или успехе. Высота резервируется вызывающим кодом. */
export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-zinc-200 bg-zinc-50 text-zinc-500",
  } as const;
  return <p className={cx("rounded-lg border px-3.5 py-2.5 text-sm", tones[tone])}>{children}</p>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
      <DocumentIcon />
      <p className="max-w-sm text-sm text-zinc-500">{children}</p>
    </div>
  );
}

/** Лист документа с загнутым углом — метафора ДИ, используется в пустых состояниях. */
export function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cx("size-10 text-zinc-300", className)}
      viewBox="0 0 40 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 5a2 2 0 0 1 2-2h18l14 14v26a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z" />
      <path d="M23 3v14h14" />
      <path d="M11 26h18M11 33h12" strokeLinecap="round" />
    </svg>
  );
}
