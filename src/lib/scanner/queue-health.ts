import 'server-only';
import {db} from '../db';
import {readWorkerHealth} from '../../../scripts/scanner-supervisor.mjs';
export async function scannerQueueHealth(){
 const h=readWorkerHealth();
 if(!h.available)await db.scan.updateMany({where:{status:'PENDING',startedAt:{lt:new Date(Date.now()-120000)}},data:{status:'FAILED',finishedAt:new Date(),lastError:'Задание не принято worker за 2 минуты. Worker недоступен или получил ошибку. Перезапустите приложение через npm start и запустите задание повторно; запросов к сайту не было.'}});
 return {available:h.available,stage:h.stage};
}
