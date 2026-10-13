import { t , ui } from "@/lib/i18n/ru";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { targetUrl } from "@/lib/health";
import { pageTypes } from "@/lib/scanner/url";
import { classifyAction } from "@/app/scanner/actions";
export const dynamic = "force-dynamic";
export default async function Pages({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams,
    base = await targetUrl(),
    site = await db.site.findUnique({ where: { baseUrl: base } });
  const where: Prisma.PageWhereInput = { siteId: site?.id ?? "__none__" };
  if (params.q)
    where.OR = [
      { url: { contains: params.q, mode: "insensitive" } },
      {
        latestScanPage: {
          is: { title: { contains: params.q, mode: "insensitive" } },
        },
      },
      {
        latestScanPage: {
          is: { h1: { contains: params.q, mode: "insensitive" } },
        },
      },
    ];
  if (
    params.type &&
    pageTypes.includes(params.type as (typeof pageTypes)[number])
  )
    where.pageType = params.type;
  const snapshot: Prisma.ScanPageWhereInput = {};
  if (/^[1-5]\d\d$/.test(params.status ?? ""))
    snapshot.statusCode = Number(params.status);
  if (
    ["BLOCKED_BY_WAF", "AUTH_REQUIRED", "ERROR"].includes(params.status ?? "")
  )
    snapshot.outcome = params.status;
  if (params.indexable === "yes") snapshot.indexable = true;
  if (params.indexable === "no") snapshot.indexable = false;
  const missing: Record<string, string> = {
    title: "title",
    description: "description",
    h1: "h1",
  };
  if (params.issue && missing[params.issue])
    snapshot.OR = [
      { [missing[params.issue]]: null },
      { [missing[params.issue]]: "" },
    ];
  if (Object.keys(snapshot).length) where.latestScanPage = { is: snapshot };
  if (params.issue === "duplicate" && site) {
    const duplicates = await db.$queryRaw<
      { id: string }[]
    >`SELECT p.id FROM "Page" p JOIN "ScanPage" s ON s.id = p."latestScanPageId" WHERE p."siteId" = ${site.id} AND ((s.title IS NOT NULL AND s.title <> '' AND s.title IN (SELECT s2.title FROM "Page" p2 JOIN "ScanPage" s2 ON s2.id = p2."latestScanPageId" WHERE p2."siteId" = ${site.id} GROUP BY s2.title HAVING count(*) > 1)) OR (s.description IS NOT NULL AND s.description <> '' AND s.description IN (SELECT s2.description FROM "Page" p2 JOIN "ScanPage" s2 ON s2.id = p2."latestScanPageId" WHERE p2."siteId" = ${site.id} GROUP BY s2.description HAVING count(*) > 1)))`;
    where.id = { in: duplicates.map((p) => p.id) };
  }
  const number = Math.max(
      1,
      Math.min(100000, Math.trunc(Number(params.page) || 1)),
    ),
    take = 25;
  const [pages, total] = await Promise.all([
    db.page.findMany({
      where,
      include: { latestScanPage: true },
      orderBy: { normalizedUrl: "asc" },
      take,
      skip: (number - 1) * take,
    }),
    db.page.count({ where }),
  ]);
  const pagination = (n: number) => {
    const search = new URLSearchParams(
      Object.entries(params).filter((entry): entry is [string, string] =>
        Boolean(entry[1]),
      ),
    );
    search.set("page", String(n));
    return "/pages?" + search.toString();
  };
  return (
    <>
      <p className="eyebrow">{t("PAGE INVENTORY")}</p>
      <h1>{t("Pages")}</h1>
      <p className="muted">
        {total} {t("страниц · последние snapshots · HTTP / BROWSER / IMPORT")}</p>
      <form className="panel filters">
        <input
          name="q"
          aria-label={t("Поиск URL/title/H1")}
          defaultValue={params.q}
          placeholder={t("URL, Title или H1")}
        />
        <select
          name="status"
          aria-label={t("HTTP status")}
          defaultValue={params.status ?? ""}
        >
          <option value="">{t("Любой статус")}</option>
          {[
            "200",
            "301",
            "302",
            "404",
            "500",
            "503",
            "BLOCKED_BY_WAF",
            "AUTH_REQUIRED",
            "ERROR",
          ].map((v) => (
            <option key={v} value={v}>{t(v)}</option>
          ))}
        </select>
        <select
          name="type"
          aria-label={t("Тип страницы")}
          defaultValue={params.type ?? ""}
        >
          <option value="">{t("Все типы")}</option>
          {pageTypes.map((v) => (
            <option key={v} value={v}>{t(v)}</option>
          ))}
        </select>
        <select
          name="issue"
          aria-label={t("Проблема")}
          defaultValue={params.issue ?? ""}
        >
          <option value="">{t("Все страницы")}</option>
          <option value="title">{t("Missing title")}</option>
          <option value="description">{t("Missing description")}</option>
          <option value="h1">{t("Missing H1")}</option>
          <option value="duplicate">{t("Duplicate title/description")}</option>
        </select>
        <select
          name="indexable"
          aria-label={t("Indexable")}
          defaultValue={params.indexable ?? ""}
        >
          <option value="">{t("Любая индексируемость")}</option>
          <option value="yes">{t("Indexable")}</option>
          <option value="no">{t("Non-indexable")}</option>
        </select>
        <button>{t("Применить")}</button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("URL / type")}</th>
              <th>{t("Status / source")}</th>
              <th>{t("Title / H1")}</th>
              <th>{t("Words")}</th>
              <th>{t("Canonical")}</th>
              <th>{t("Last scan")}</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => {
              const s = page.latestScanPage;
              return (
                <tr key={page.id}>
                  <td>
                    <Link href={"/pages/" + page.id}>{page.normalizedUrl}</Link>
                    <form action={classifyAction}>
                      <input type="hidden" name="pageId" value={page.id} />
                      <select
                        name="pageType"
                        aria-label={"Тип " + page.url}
                        defaultValue={page.pageType}
                      >
                        {pageTypes.map((type) => (
                          <option key={type} value={type}>{t(type)}</option>
                        ))}
                      </select>
                      <button>{t("Сохранить тип")}</button>
                      {page.manualType && <small>{t("Manual")}</small>}
                    </form>
                  </td>
                  <td>
                    {ui(s?.statusCode ?? "—")}
                    <br />
                    {t(s?.outcome)}
                    <br />
                    {t(s?.source)}
                  </td>
                  <td>
                    {s?.title ?? "—"}
                    <hr />
                    {s?.h1 ?? "—"}
                  </td>
                  <td>{s?.wordCount ?? "—"}</td>
                  <td>{s?.canonical ?? "—"}</td>
                  <td>
                    {s?.scannedAt.toLocaleString("ru-RU", {
                      timeZone: "Europe/Moscow",
                    }) ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="buttons">
        {number > 1 && <Link href={pagination(number - 1)}>{t("← Предыдущая")}</Link>}
        {number * take < total && (
          <Link href={pagination(number + 1)}>{t("Следующая →")}</Link>
        )}
      </div>
    </>
  );
}
