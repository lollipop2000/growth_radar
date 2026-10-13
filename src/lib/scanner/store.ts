import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { PageResult } from "./model";
import { classify, normalizeUrl } from "./url";
import {meaningfulDiff} from './content';
import {observedRedirect} from './redirects';
import {mappedProductType} from './page-type';
import {mappingRegistry} from '../business/typed-import';
import type {ContentSignals} from './content';
export async function saveScanPage(
  scanId: string,
  siteId: string,
  result: PageResult,
  checkpoint?: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const { diagnostics: _diagnostics, redirectHops, ...snapshotResult } = result;
  const successful=result.outcome==='OK'&&result.statusCode!=null&&result.statusCode>=200&&result.statusCode<300;
  const normalizedUrl = normalizeUrl(
    result.requestedUrl,
    undefined,
    successful?result.finalUrl:undefined,
  );
  await db.$transaction(async (tx) => {
    const site=await tx.site.findUniqueOrThrow({where:{id:siteId},select:{baseUrl:true}});
    if(new URL(result.requestedUrl).origin!==new URL(site.baseUrl).origin||new URL(result.finalUrl).origin!==new URL(site.baseUrl).origin)throw Error('Cross-site redirect rejected');
    const redirectsJson=[...result.redirectsJson,...(redirectHops??[])];
    const redirected=observedRedirect({...snapshotResult,redirectsJson},site.baseUrl);
    const previous = await tx.page.findUnique({
      where: { siteId_normalizedUrl: { siteId, normalizedUrl } },
    });
    const aliases = Array.from(
      new Set([
        ...(Array.isArray(previous?.aliasesJson)
          ? previous.aliasesJson.filter(
              (v): v is string => typeof v === "string",
            )
          : []),
        ...(redirected?[normalizeUrl(result.requestedUrl)]:[]),
        normalizedUrl,
      ]),
    );
    let pageType=previous&&(!successful||previous.pageType==='product')?previous.pageType:classify(normalizedUrl);
    if(successful&&!previous?.manualType&&classify(normalizedUrl)==='category'&&result.h1&&result.contentSignalsJson){
      const records=await tx.businessRecord.findMany({where:{siteId,import:{kind:'MAPPING',status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}}},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{sku:true,productGroup:true,productName:true,rawUrl:true,brand:true,category:true,attributesJson:true}});
      pageType=mappedProductType(result.finalUrl,aliases,mappingRegistry(records),result.h1,result.contentSignalsJson as ContentSignals)??pageType;
    }
    const page = await tx.page.upsert({
      where: { siteId_normalizedUrl: { siteId, normalizedUrl } },
      create: {
        siteId,
        normalizedUrl,
        url: successful?result.finalUrl:result.requestedUrl,
        path: new URL(normalizedUrl).pathname,
        pageType,
        aliasesJson: aliases,
      },
      update: {
        lastSeenAt: new Date(),
        ...(successful?{active:true}:{}),
        aliasesJson: aliases,
        ...(successful ? { url: result.finalUrl } : {}),
        ...(previous?.manualType ? {} : { pageType }),
      },
    });
    if(redirected)await tx.page.updateMany({where:{siteId,normalizedUrl:normalizeUrl(result.requestedUrl),id:{not:page.id}},data:{active:false}});
    const prior=successful?await tx.scanPage.findFirst({where:{pageId:page.id,scanId:{not:scanId},outcome:'OK',statusCode:{gte:200,lt:400}},orderBy:{scannedAt:'desc'}}):null;
    const snapshot = await tx.scanPage.upsert({
      where: { scanId_pageId: { scanId, pageId: page.id } },
      create: { scanId, pageId: page.id, ...snapshotResult,redirectsJson },
      update: { ...snapshotResult,redirectsJson, scannedAt: new Date() },
    });
    if(prior){const diff=meaningfulDiff(prior,snapshot);if(Object.keys(diff).length)await tx.pageChange.upsert({where:{scanPageId:snapshot.id},create:{pageId:page.id,scanPageId:snapshot.id,previousScanPageId:prior.id,diffJson:diff as Prisma.InputJsonValue},update:{diffJson:diff as Prisma.InputJsonValue}});}
    await tx.page.update({
      where: { id: page.id },
      data: { latestScanPageId: snapshot.id },
    });
    await checkpoint?.(tx);
  },{timeout:30000,maxWait:10000});
}


