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
          ? "bg-orange-50 text-orange-700"
          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900")
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
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Image
            src="/myasnitsky-logo-v2.png"
            alt="ООО МПЗ Мясницкий Ряд"
            width={1024}
            height={855}
            className="h-10 w-auto object-contain object-left"
            priority
          />
          <span className="hidden text-sm font-semibold tracking-tight text-zinc-900 sm:inline">
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
                className="hidden max-w-40 truncate rounded-lg px-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 md:inline"
                title="Сменить пароль"
              >
                {session.user.name}
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
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
