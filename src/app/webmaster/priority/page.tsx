import { t , ui } from "@/lib/i18n/ru";
import Link from "next/link";
import { PriorityForm } from "@/components/dataset-forms";
import { previewPriority } from "@/lib/yandex/priority";
import { config, readIntegration } from "@/lib/yandex/settings";
export const dynamic = "force-dynamic";
export default async function PriorityPage() {
  const c = config((await readIntegration("WEBMASTER"))?.configJson);
  let preview: Awaited<ReturnType<typeof previewPriority>>;
  try { preview = await previewPriority(); }
  catch { return <><h1>{t("Priority Scope")}</h1><p>{t("Сначала проверьте подключение Вебмастера и выберите host. Нужны валидные URL в dataset.")}</p><Link href="/settings">{t("Settings")}</Link></>; }
  return <><h1>{t("Webmaster · Priority Scope")}</h1><p>{t("Приоритет: visits ↓, затем Webmaster discovery, затем product/category при равенстве. Без LLM и Opportunity Score.")}</p>
    <p>{t("Полная очередь 690 URL не нужна для MVP. Неопределённый POST блокирует новые exports; повторно автоматически не отправляется.")}</p>
    <p>{t("Сохранённый scope:")}{" "}{ui(c.priorityScope?.mode ?? "не выбран")} · {c.priorityScope?.urls.length ?? 0} {t("URL; watermark:")}{" "}{c.priorityScope?.syncedThrough ?? "нет"}.</p>
    {!!c.priorityScope?.urls.length && <details><summary>{t("Сохранённые URL для daily sync")}</summary><ul>{c.priorityScope.urls.map(url => <li key={url}>{url}</li>)}</ul></details>}
    <Link href="/unmatched?source=METRIKA">{t("Traffic coverage / dataset")}</Link>
    <PriorityForm initial={{ ...preview, message: "Preview TOP 20. Export ещё не запускался." }}/></>;
}
