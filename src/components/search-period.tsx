import Link from 'next/link';
import {searchPeriods,type SearchSelection} from '@/lib/search/periods';
export function SearchPeriodLinks({base,selection,param='period'}:{base:string;selection:SearchSelection;param?:string}){return <p>Период поиска: {searchPeriods.map(([value,label])=><Link key={value} href={`${base}${base.includes('?')?'&':'?'}${param}=${value}`} aria-current={selection===value?'page':undefined}>{label}{' · '}</Link>)}</p>;}
