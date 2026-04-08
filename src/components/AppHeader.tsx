"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function AppHeader() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  return (
    <header className="sticky top-0 z-50 border-b border-orange-100 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center rounded-lg outline-none ring-orange-400 focus-visible:ring-2"
          >
            <Image
              src="/myasnitsky-logo.png"
              alt="ООО МПЗ Мясницкий Ряд"
              width={240}
              height={96}
              className="h-11 w-auto object-contain object-left sm:h-12 md:h-14"
              priority
            />
          </Link>
          <p className="text-right hidden text-[11px] font-semibold uppercase leading-tight tracking-wide text-orange-700 sm:block sm:text-xs">
            DI: Кадровый Навигатор
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/readme"
            className="inline-flex h-9 items-center rounded-xl border border-orange-200 bg-white px-3 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
          >
            Документация
          </Link>
          {session?.user && (
            <>
              <Link
                href="/history"
                className="inline-flex h-9 items-center rounded-xl border border-orange-200 bg-white px-3 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
              >
                История
              </Link>
              <Link
                href="/analyze"
                className="inline-flex h-9 items-center rounded-xl border border-orange-200 bg-white px-3 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
              >
                Проверка ДИ
              </Link>
              <Link
                href="/account"
                className="inline-flex h-9 items-center rounded-xl border border-orange-200 bg-white px-3 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
              >
                Сменить пароль
              </Link>
              {role === "admin" && (
                <>
                  <Link
                    href="/admin/settings"
                    className="inline-flex h-9 items-center rounded-xl border border-orange-200 bg-white px-3 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
                  >
                    Настройки API
                  </Link>
                  <Link
                    href="/admin/users"
                    className="inline-flex h-9 items-center rounded-xl border border-orange-200 bg-white px-3 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
                  >
                    Пользователи
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex h-9 items-center rounded-xl bg-orange-600 px-3 text-sm font-medium text-white transition hover:bg-orange-700"
              >
                Выход
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
