import {db} from '../src/lib/db';
const scan=await db.scan.findFirst({where:{site:{baseUrl:'https://shop.gazpromneft-sm.ru/'}},orderBy:{startedAt:'desc'},select:{id:true,status:true,mode:true,startedAt:true,finishedAt:true,pagesScanned:true,errorsCount:true,lastError:true,discoveryErrorsJson:true,pages:{select:{requestedUrl:true,finalUrl:true,statusCode:true,httpStatusCode:true,outcome:true,error:true,source:true}}}});
console.log(JSON.stringify(scan,null,2));await db.$disconnect();
