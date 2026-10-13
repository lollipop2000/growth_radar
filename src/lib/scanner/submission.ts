/** UI wiring only; adapters and queue coordinators remain unchanged. */
export function scannerSubmission(form:FormData){
 const scope=String(form.get('scanScope')??'SITE'),preset=String(form.get('preset')??'FULL'),transport=String(form.get('transport')??'HTTP_BROWSER');
 if(!['SITE','SINGLE','SOURCE'].includes(scope)||!['FULL','DIAGNOSTIC','TEST_ONE','TARGETED'].includes(preset)||!['HTTP_BROWSER','HTTP_ONLY','BROWSER_ONLY'].includes(transport))throw Error('Некорректные настройки сканирования.');
 const source=String(form.get('scope')??'UNMATCHED');if(!['UNMATCHED','ALL','SEO_RESCAN','SEARCH_UNMATCHED'].includes(source))throw Error('Некорректный источник URL.');
 if(form.has('searchScope')&&(scope!=='SOURCE'||!['SEO_RESCAN','SEARCH_UNMATCHED'].includes(source)))throw Error('Некорректный Search source: выбор источника сброшен. Повторите выбор и предпросмотр.');
 return {scope,preset,source,transport,mode:transport==='BROWSER_ONLY'?'BROWSER' as const:'HTTP' as const,browserFallback:transport==='HTTP_BROWSER',single:scope==='SINGLE',delayMs:Number(form.get('delayMs')??3000),maxPages:Number(form.get('maxPages')??50),limit:Number(form.get('diagnosticLimit')??10),period:Number(form.get('period')??30),batchSize:Number(form.get('batchSize')??50),rescan:form.get('rescanSuccessful')==='on',seeds:String(form.get('seeds')??'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean),excludes:String(form.get('excludes')??'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean),testUrl:String(form.get('testUrl')??'').trim()};
}
