import 'server-only';
import {datasetPageSelect} from '../opportunities/read-projections';
import {db} from '../db';
import {businessRevisionSelect} from './revision';
/** Owned by a single request; no process/global data cache. */
export async function prepareBusinessContext(siteId:string){
 const [pages,records,imports,files]=await Promise.all([
 db.page.findMany({where:{siteId,active:true},select:datasetPageSelect}),
 db.businessRecord.findMany({where:{siteId,import:{status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}}},include:{import:{select:{kind:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}]}),
 db.import.findMany({where:{siteId,status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}},select:businessRevisionSelect}),
 db.import.findMany({where:{siteId,kind:{in:['STOCK','PRICES','SALES']},status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}},select:{id:true,kind:true,sheetName:true,dataJson:true}})
 ]);return {pages,records,imports,files};
}
export type BusinessContext=Awaited<ReturnType<typeof prepareBusinessContext>>;
/** Summary requests need identities for matching, never scan content/history. */
export async function prepareBusinessSummaryContext(siteId:string){
 const [pages,records,imports,files]=await Promise.all([
 db.page.findMany({where:{siteId,active:true},select:{id:true,url:true,normalizedUrl:true,aliasesJson:true}}),
 db.businessRecord.findMany({where:{siteId,import:{status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}}},include:{import:{select:{kind:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}]}),
 db.import.findMany({where:{siteId,status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}},select:businessRevisionSelect}),
 db.import.findMany({where:{siteId,kind:{in:['STOCK','PRICES','SALES']},status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}},select:{id:true,kind:true,sheetName:true,dataJson:true}})
 ]);return {pages,records,imports,files};
}
export type BusinessSummaryContext=Awaited<ReturnType<typeof prepareBusinessSummaryContext>>;
