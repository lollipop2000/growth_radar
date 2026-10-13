import Link from "next/link";
import { t } from "../lib/i18n/ru";
export default function NotFound(){return <section className="panel"><h1>{t("Страница не найдена")}</h1><Link href="/">{t("Вернуться к обзору")}</Link></section>;}
