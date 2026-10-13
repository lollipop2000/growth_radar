import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {db} from '../src/lib/db';
import {currentSite,json} from '../src/lib/yandex/settings';
import {uploadSearch,previewSearch,commitSearch} from '../src/lib/search/import-service';
import {suggestSearchMapping} from '../src/lib/search/import';
import {saveScanPage} from '../src/lib/scanner/store';
import {emptyResult,parseHtml} from '../src/lib/scanner/model';
import {normalizeUrl} from '../src/lib/scanner/url';
import {calculateSeoActions,setSeoStatus} from '../src/lib/seo-actions/service';
import {calculateOpportunities} from '../src/lib/opportunities/service';
import {saveWebmasterRows} from '../src/lib/yandex/store';
import {seoDefaults} from '../src/lib/seo-actions/config';
import {businessDraft,commitBusiness,validateBusiness} from '../src/lib/business/service';
import {period,days,day} from '../src/lib/yandex/dates';
import {dataForSite} from '../src/lib/yandex/views';
import {goalConfig} from '../src/lib/yandex/goal-types';
const target=await db.integration.findUniqueOrThrow({where:{type:'Target Site'}}),oldConfig=target.configJson,oldM=await db.integration.findUniqueOrThrow({where:{type:'Yandex Metrika'}}),oldW=await db.integration.findUniqueOrThrow({where:{type:'Yandex Webmaster'}}),dates=period(7);
try{
 const site=await db.site.create({data:{baseUrl:`http://127.0.0.1:4778/seo-${Date.now()}/`,name:'Локальная приёмка SEO'}});await db.integration.update({where:{id:target.id},data:{configJson:json({baseUrl:site.baseUrl})}});assert.equal((await currentSite()).id,site.id);
 await db.integration.update({where:{id:oldM.id},data:{configJson:json({siteId:site.id,counterId:process.env.YANDEX_METRIKA_COUNTER_ID})}});await db.integration.update({where:{id:oldW.id},data:{configJson:json({siteId:site.id,hostId:'seo-fixture'})}});
 const scan=await db.scan.create({data:{siteId:site.id,status:'COMPLETED',mode:'HTTP'}});for(const id of ['product-a','product-b','category']){const url=site.baseUrl+id+'/',html=`<html><title>Масло</title><body><main><h1>Масло</h1><p>Для автомобиля</p></main></body></html>`,parsed=parseHtml(html,url,site.baseUrl);await saveScanPage(scan.id,site.id,{...emptyResult(url,'HTTP'),...parsed.fields,statusCode:200});}
 const pages=await db.page.findMany({where:{siteId:site.id}});for(const p of pages)await db.page.update({where:{id:p.id},data:{pageType:p.url.includes('category')?'category':'product',manualType:true}});
 const headers=['Date','URL','Query','Impressions','Clicks','CTR','Average Position','Region'],csv=[headers.join(';'),...pages.flatMap(p=>days(dates.from,dates.to).map(date=>[date,p.url,'купить масло оптом 20л гидросистема iso vg 46 аналог shell',300,3,1,8,''].join(';')))].join('\n');
 const file=await uploadSearch(Buffer.from(csv),'fixture.csv');await assert.rejects(()=>businessDraft(file.id));await assert.rejects(()=>commitBusiness(file.id));await assert.rejects(()=>validateBusiness(file.id,{sheetName:'CSV',mapping:{},dateFormat:'ISO',numericFormat:'EN'}));assert.equal((await db.import.findUniqueOrThrow({where:{id:file.id}})).status,'DRAFT');const first=await previewSearch(file.id,'CSV',suggestSearchMapping(headers));assert.equal(first.rowsErrors,0);await commitSearch(file.id);const rowCount=await db.webmasterQueryDaily.count({where:{siteId:site.id}});await commitSearch(file.id);assert.equal(await db.webmasterQueryDaily.count({where:{siteId:site.id}}),rowCount);
 const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Данные');sheet.addRow(headers);sheet.addRow([dates.from,pages[0].url,'купить масло оптом 20л гидросистема iso vg 46 аналог shell',300,3,1,8,'']);const xlsx=await uploadSearch(Buffer.from(await wb.xlsx.writeBuffer()),'fixture.xlsx');await previewSearch(xlsx.id,'Данные',suggestSearchMapping(headers));await commitSearch(xlsx.id);assert.equal(await db.webmasterQueryDaily.count({where:{siteId:site.id}}),rowCount);
 const api=await db.jobRun.create({data:{siteId:site.id,integrationId:oldW.id,source:'WEBMASTER',mode:'FIXTURE',status:'COMPLETED',dateFrom:day(dates.from),dateTo:day(dates.to),configJson:{hostId:'seo-fixture'}}});await saveWebmasterRows(api.id,[{date:dates.from,url:pages[0].url,query:'купить масло оптом 20л гидросистема iso vg 46 аналог shell',region:null,impressions:400,clicks:4,ctr:1,avgPosition:8,rawJson:{}}],{});
 const view=await dataForSite(7);assert.equal(view.webmaster.length,rowCount);assert.equal(view.webmaster.reduce((n,r)=>n+r.impressions,0),rowCount*300+100);
 const options={siteId:site.id,hostId:'seo-fixture',counterId:process.env.YANDEX_METRIKA_COUNTER_ID,goalConfig:goalConfig({})};await calculateOpportunities(7,options);const result=await calculateSeoActions(7,options);for(const id of ['A01','A02','A03','A04','A05','A06','A07','A08','A10','A11','A12'])assert.ok(result.actions.some(a=>a.actionId===id),id);assert.ok(result.actions.some(a=>a.category==='CANNIBALIZATION'));
 const persisted=await db.seoAction.findMany({where:{siteId:site.id}}),action=persisted.find(a=>a.actionId==='A02')!;await setSeoStatus(action.id,'IMPLEMENTED','Обновлено вручную');const done=await db.seoAction.findUniqueOrThrow({where:{id:action.id}});assert.ok(done.implementedAt);assert.equal((done.baselineJson as {impressions:number}).impressions,action.pageId===pages[0].id?2200:2100);await calculateSeoActions(7,options);assert.equal(await db.seoAction.count({where:{siteId:site.id}}),persisted.length);assert.equal((await db.seoAction.findUniqueOrThrow({where:{id:action.id}})).status,'IMPLEMENTED');
 const another=await db.scan.create({data:{siteId:site.id,status:'COMPLETED'}}),url=pages[0].url,changed=parseHtml('<html><title>Масло 20 л</title><body><h1>Масло</h1></body></html>',url,site.baseUrl);await saveScanPage(another.id,site.id,{...emptyResult(url,'HTTP'),...changed.fields,statusCode:200});await saveScanPage(another.id,site.id,{...emptyResult(url,'HTTP'),...changed.fields,statusCode:200});assert.equal(await db.pageChange.count({where:{pageId:pages[0].id}}),1);
 const template=new ExcelJS.Workbook();await template.xlsx.load(readFileSync('public/templates/webmaster_search_template.xlsx') as unknown as Parameters<typeof template.xlsx.load>[0]);assert.equal(template.worksheets.length,2);assert.deepEqual((template.getWorksheet('Данные')!.getRow(1).values as string[]).slice(1),headers);
 const report={status:'PASS',siteId:site.id,baseUrl:site.baseUrl,pageId:pages[1].id,importId:file.id,opportunityId:(await db.opportunity.findFirst({where:{siteId:site.id}}))?.id,actionId:action.id,rows:rowCount,actions:persisted.length,csv:true,xlsx:true,apiDedup:true,baseline:true,idempotent:true,pageChanges:true,template:true,config:seoDefaults};writeFileSync('test-results/seo-actions-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.integration.update({where:{id:target.id},data:{configJson:json(oldConfig)}});await db.integration.update({where:{id:oldM.id},data:{configJson:json(oldM.configJson)}});await db.integration.update({where:{id:oldW.id},data:{configJson:json(oldW.configJson)}});await db.$disconnect();}

