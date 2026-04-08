import { readFile } from "fs/promises";
import { join } from "path";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata = {
  title: "Инструкция | Кадровик DI",
  description: "Инструкция по работе с приложением",
};

const readmeArticleClass =
  "max-w-none text-[15px] leading-relaxed text-zinc-800 " +
  "[&_h1]:mt-10 [&_h1]:scroll-mt-24 [&_h1]:border-b [&_h1]:border-orange-100 [&_h1]:pb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-zinc-900 [&_h1]:first:mt-0 " +
  "[&_h2]:mt-9 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-900 " +
  "[&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-800 " +
  "[&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-zinc-900 " +
  "[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14px] " +
  "[&_thead_th]:bg-orange-50 [&_thead_th]:text-zinc-900 " +
  "[&_th]:border [&_th]:border-orange-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top " +
  "[&_td]:border [&_td]:border-orange-100 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:whitespace-normal " +
  "[&_tr:nth-child(even)_td]:bg-zinc-50/50 " +
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 " +
  "[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:mt-1.5 [&_li]:pl-0.5 " +
  "[&_a]:font-medium [&_a]:text-orange-700 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-orange-800 " +
  "[&_code]:rounded-md [&_code]:bg-orange-50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-zinc-800 " +
  "[&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-orange-100 [&_pre]:bg-zinc-50 [&_pre]:p-4 [&_pre]:text-sm " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit " +
  "[&_hr]:my-10 [&_hr]:border-orange-100";

export default async function ReadmePage() {
  const raw = await readFile(join(process.cwd(), "README.md"), "utf-8");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-16 text-zinc-900">
      <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)] sm:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Инструкция</h1>

        <article className={`mt-8 ${readmeArticleClass}`}>
          <Markdown remarkPlugins={[remarkGfm]}>{raw}</Markdown>
        </article>
      </div>
    </main>
  );
}
