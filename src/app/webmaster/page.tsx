import { IntegrationReport } from "@/components/integration-report";
import Link from 'next/link';
import {defaultSearchSelection} from '@/lib/search/range';
import {monthlySelection} from '@/lib/search/periods';
import {currentSite} from '@/lib/yandex/settings';
import {MonthlySearchReport} from '@/components/monthly-report';
export const dynamic = "force-dynamic";
export default async function Webmaster({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const site=await currentSite(),selection=await defaultSearchSelection(site.id,(await searchParams).period,30);
  return (
    <><section className='panel'><h2>Импорт поисковых данных</h2><p>Загрузите CSV/XLSX с датой, URL, запросом, показами, кликами, CTR и средней позицией. Регион необязателен.</p><Link href='/webmaster/import'>Загрузить и проверить файл</Link> · <Link href='/templates/webmaster_search_template.xlsx' download>Скачать шаблон</Link></section>{monthlySelection(selection)?<MonthlySearchReport selection={selection} site={site}/>:<IntegrationReport
      source="WEBMASTER"
      period={(await searchParams).period}
    />}</>
  );
}
