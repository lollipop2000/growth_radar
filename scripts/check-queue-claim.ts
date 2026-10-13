import {writeFileSync} from 'node:fs';
import {db} from '../src/lib/db';
const scan=await db.scan.findUniqueOrThrow({where:{id:'cmuy99pra000820gk8ew67rby'},select:{id:true,status:true,startedAt:true,heartbeatAt:true,finishedAt:true}});
const result={scan,workerClaimed:scan.heartbeatAt!==null,noLongerPending:scan.status!=='PENDING',scope:'queue lifecycle metadata only; HTTP/content not inspected'};
writeFileSync('test-results/queue-fix-claim.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await db.$disconnect();
