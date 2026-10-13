import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
// Prove the application sees the isolated database before browser POSTs.
export async function assertFixtureServer(databaseUrl,port=3000){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid fixture port');
 const url=new URL(databaseUrl);
 if(!/^\/radar_stabilization1_\d+$/.test(url.pathname))throw Error('Fixture DB required');
 const db=new PrismaClient({datasourceUrl:databaseUrl});
 const baseUrl='http://127.0.0.1:48999/isolation-'+randomUUID()+'/';
 const target=await db.integration.findUniqueOrThrow({where:{type:'Target Site'}});
 try{
  await db.site.create({data:{baseUrl,name:'Fixture server isolation check'}});
  await db.integration.update({where:{id:target.id},data:{configJson:{baseUrl}}});
  let response;
  for(let attempt=0;attempt<30;attempt++){
   try{response=await fetch(`http://127.0.0.1:${port}/scanner`,{signal:AbortSignal.timeout(5000)});break;}
   catch(error){if(attempt===29)throw error;await delay(1000);}
  }
  if(!response.ok||!(await response.text()).includes(baseUrl))throw Error('Fixture server isolation FAILED. Browser writes are prohibited. Start the fixture server on port 3000.');
 }finally{
  await db.integration.update({where:{id:target.id},data:{configJson:target.configJson}});
  await db.$disconnect();
 }
 console.log('PASS fixture server isolation');
}
