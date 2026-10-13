import {createHash} from 'node:crypto';
export const confirmedStatuses=['COMPLETED','COMPLETED_WITH_ERRORS'];
// Revision and sales metadata do not need the potentially large source workbook.
export const businessRevisionSelect={id:true,kind:true,rowsImported:true,finishedAt:true,metadataUpdatedAt:true,salesImportMode:true,coverageFrom:true,coverageTo:true,createdAt:true} as const;
export const businessRevision=(imports:{id:string;kind:string;rowsImported:number;finishedAt:Date|null;metadataUpdatedAt:Date|null;salesImportMode:string;coverageFrom:Date|null;coverageTo:Date|null}[])=>createHash('sha256').update(JSON.stringify([...imports].sort((a,b)=>a.id.localeCompare(b.id)).map(i=>[i.id,i.kind,i.rowsImported,i.finishedAt,i.metadataUpdatedAt,i.salesImportMode,i.coverageFrom,i.coverageTo]))).digest('hex');
