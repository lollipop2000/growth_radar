import { t } from "@/lib/i18n/ru";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  title: "Радар роста — возможности магазина",
  description: "Внутренний инструмент поиска точек роста",
};
const links = [
  ["/", "Dashboard"],
  ["/pages", "Pages"],
  ["/scanner", "Site Scanner"],
  ["/webmaster", "Yandex Webmaster"],
  ["/metrika", "Yandex Metrika"],
  ["/unmatched", "Unmatched URLs"],
  ["/imports", "Excel Imports"],
  ["/business-data", "Бизнес-данные"],
  ["/opportunities", "Opportunities"],
  ["/seo-actions", "SEO-рекомендации"],
  ["/settings", "Settings"],
  ["/system", "System Status"],
];
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <aside>
          <Link href="/" className="brand">
            {t("G-market")}<span>{t("Growth Radar")}</span>
          </Link>
          <nav aria-label={t("Основная навигация")}>
            {links.map(([href, label]) => (
              <Link href={href} key={href}>
                {t(label)}
              </Link>
            ))}
          </nav>
          <small>{t("Sprint 2 · Yandex Analytics")}</small>
        </aside>
        <main>{children}</main>
      </body>
    </html>
  );
}
