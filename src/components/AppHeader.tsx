import Image from "next/image";
import Link from "next/link";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-orange-100 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
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
        <p className="text-right text-[11px] font-semibold uppercase leading-tight tracking-wide text-orange-700 sm:text-xs">
          DI: Кадровый Навигатор
        </p>
      </div>
    </header>
  );
}
