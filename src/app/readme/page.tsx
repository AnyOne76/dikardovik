import { readFile } from "fs/promises";
import { join } from "path";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata = {
  title: "Инструкция | Кадровик DI",
  description: "Инструкция по работе с приложением",
};

const readmeArticleClass =
  "max-w-none text-[15px] leading-relaxed text-[var(--foreground)] " +
  "[&_h1]:mt-10 [&_h1]:scroll-mt-24 [&_h1]:border-b [&_h1]:border-[var(--border)] [&_h1]:pb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:first:mt-0 " +
  "[&_h2]:mt-9 [&_h2]:text-lg [&_h2]:font-semibold " +
  "[&_h3]:mt-7 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&_p]:mt-3 [&_strong]:font-semibold " +
  "[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm " +
  "[&_thead_th]:bg-[var(--background)] " +
  "[&_th]:border [&_th]:border-[var(--border)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top " +
  "[&_td]:border [&_td]:border-[var(--border)] [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:whitespace-normal " +
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 " +
  "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:mt-1.5 [&_li]:pl-0.5 " +
  "[&_a]:font-medium [&_a]:text-[var(--accent-strong)] [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_code]:rounded-md [&_code]:bg-[var(--background)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] " +
  "[&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:bg-[var(--background)] [&_pre]:p-4 [&_pre]:text-sm " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit " +
  "[&_hr]:my-10 [&_hr]:border-[var(--border)]";

export default async function ReadmePage() {
  const raw = await readFile(join(process.cwd(), "README.md"), "utf-8");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 pb-16 sm:px-6">
      <div className="mb-6 border-b border-[var(--border)] pb-5">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Инструкция</h1>
        <p className="mt-1.5 text-sm text-[var(--muted)]">Порядок работы с генератором должностных инструкций.</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-8">
        <article className={readmeArticleClass}>
          <Markdown remarkPlugins={[remarkGfm]}>{raw}</Markdown>
        </article>
      </div>
    </main>
  );
}
