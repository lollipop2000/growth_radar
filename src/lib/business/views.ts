import "server-only";
import { db } from "../db";
import { productRegistry } from "./service";
import { matchUrl, urlMatcher } from "../yandex/matching";
import type { BusinessKind } from "./formats";
import { normalizeUrl } from "../scanner/url";

export async function businessData(site: { id: string; baseUrl: string }) {
  const [registry, rows, history, pages] = await Promise.all([
    productRegistry(db, site.id),
    db.businessRecord.findMany({ where: { siteId: site.id, import: { kind: { in: ["STOCK", "PRICES", "SALES"] } } }, include: { import: { select: { kind: true } } } }),
    db.import.findMany({ where: { siteId: site.id, kind: { in: ["MAPPING", "STOCK", "PRICES", "SALES"] } }, select:{id:true,kind:true,filename:true,createdAt:true,rowsTotal:true,rowsImported:true,rowsErrors:true,unknownSkuCount:true,status:true,salesImportMode:true,coverageFrom:true,coverageTo:true}, orderBy: { createdAt: "desc" } }),
    db.page.findMany({ where: { siteId: site.id, active: true }, select: { id: true, normalizedUrl: true, aliasesJson: true } }),
  ]);
  const match=urlMatcher(site.baseUrl,pages);
  const urls = [...new Set(registry.map(r => normalizeUrl(r.rawUrl,site.baseUrl)))];
  const matched = urls.filter(url => match(url).pageId).length;
  const groups = new Set(registry.map(r => r.productGroup)), withUrl = new Set(registry.filter(r => r.rawUrl).map(r => r.productGroup));
  const known = new Set(registry.map(r => r.sku));
  const mapping = { skus: registry.length, groups: groups.size, withUrl: withUrl.size, matched, unmatched: urls.length - matched,withCoefficient:registry.filter(p=>p.kgPerUnit!=null).length,withoutCoefficient:registry.filter(p=>p.kgPerUnit==null).length };
  const stats = Object.fromEntries((["STOCK", "PRICES", "SALES"] as const).map(kind => {
    const data = rows.filter(r => r.import.kind === kind), dates = data.flatMap(r => r.date ? [r.date.toISOString().slice(0, 10)] : []).sort();
    return [kind, { first: dates[0] ?? null, last: dates.at(-1) ?? null, skus: new Set(data.map(r => r.sku)).size, rows: data.length, unknown: new Set(data.filter(r => !r.sku || !known.has(r.sku)).map(r => r.sku)).size }];
  })) as Record<Exclude<BusinessKind, "MAPPING">, { first: string | null; last: string | null; skus: number; rows: number; unknown: number }>;
  const historyWithSku=history.map(h=>({...h,skuCount:new Set(rows.filter(r=>r.importId===h.id).map(r=>r.sku)).size}));
  return { registry:registry.map(p=>({...p,matchStatus:match(p.rawUrl).matchStatus})), mapping, stats, history:historyWithSku };
}
