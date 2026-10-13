import 'server-only';
import {saveScanPage} from './store';
import {emptyResult,type PageResult} from './model';
import {failureCode,infrastructureFailure} from './failures';
export async function saveResultIsolated(scanId:string,siteId:string,page:PageResult,save=saveScanPage){
 try{await save(scanId,siteId,page);}catch(error){
  if(infrastructureFailure(error)&&failureCode(error)!=='P2028')throw error;
  const fallback={...emptyResult(page.requestedUrl,page.source),outcome:'ERROR' as const,error:'PAGE_SAVE_ERROR: '+failureCode(error),statusCode:page.statusCode,httpStatusCode:page.httpStatusCode,responseTimeMs:page.responseTimeMs,diagnostics:page.diagnostics};
  await save(scanId,siteId,fallback);Object.assign(page,fallback);
 }
}
