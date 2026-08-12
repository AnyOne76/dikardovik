"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type NavItem = { href: string; label: string; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Генерация" },
  { href: "/history", label: "История" },
  { href: "/analyze", label: "Проверка ДИ" },
  { href: "/readme", label: "Инструкция" },
  { href: "/admin/settings", label: "Настройки", adminOnly: true },
  { href: "/admin/users", label: "Пользователи", adminOnly: true },
];

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors " +
        (active
          ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]")
      }
    >
      {label}
    </Link>
  );
}

export function AppHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const role = session?.user?.role;

  // Пока сессия грузится, ничего не показываем вместо меню, но место под него
  // держим: иначе кнопки появляются рывком и вся страница уезжает вниз.
  const loading = status === "loading";
  const items = NAV.filter((item) => !item.adminOnly || role === "admin");

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Image
            src="/myasnitsky-logo.png"
            alt="ООО МПЗ Мясницкий Ряд"
            width={240}
            height={96}
            className="h-9 w-auto object-contain object-left"
            priority
          />
          <span className="hidden text-sm font-semibold tracking-tight text-[var(--foreground)] sm:inline">
            Кадровый навигатор
          </span>
        </Link>

        {/* min-w-0 + overflow-x-auto: длинное меню прокручивается, а не переносится
            на вторую строку, из-за чего высота шапки менялась бы на ходу. */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {!loading &&
            session?.user &&
            items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
              />
            ))}
          {!loading && !session?.user && (
            <NavLink href="/readme" label="Инструкция" active={pathname.startsWith("/readme")} />
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {!loading && session?.user && (
            <>
              <Link
                href="/account"
                className="hidden max-w-40 truncate rounded-lg px-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)] md:inline"
                title="Сменить пароль"
              >
                {session.user.name}
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background)]"
              >
                Выйти
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
