import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync,writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { json,config } from "../src/lib/yandex/settings";

const fixture=JSON.parse(readFileSync("test-results/sprint3-1-acceptance.json","utf8"));
const site=await db.site.findUniqueOrThrow({where:{id:fixture.siteId}}),target=await db.integration.findUniqueOrThrow({where:{type:"Target Site"}}),metrika=await db.integration.findUniqueOrThrow({where:{type:"Yandex Metrika"}});
assert.ok(site.baseUrl.startsWith("http://127.0.0.1:"));
assert.equal(await db.scan.count({where:{status:{in:["PENDING","RUNNING","PAUSING","STOPPING","IMPORTING"]}}}),0);
assert.equal(await db.jobRun.count({where:{status:{in:["PENDING","RUNNING","WAITING_EXPORT","WAITING_QUOTA"]}}}),0);
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
try {
  await db.integration.update({where:{id:target.id},data:{configJson:json({...target.configJson as object,url:site.baseUrl,baseUrl:site.baseUrl})}});
  await db.integration.update({where:{id:metrika.id},data:{configJson:json({siteId:site.id,counterId:process.env.YANDEX_METRIKA_COUNTER_ID,goals:fixture.goals,primaryGoals:fixture.goals.map((g:{id:string})=>g.id),dailyEnabled:false})}});
  await page.goto("http://127.0.0.1:3000/settings",{waitUntil:"networkidle"});
  for(const g of fixture.goals)assert.equal(await page.locator(`select[name="goalType_${g.id}"]`).inputValue(),"IGNORE");
  await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle"});
  assert.match(await page.locator("main").innerText(),/Для анализа бизнес-конверсии не настроены бизнес-цели/);
  assert.match(await page.getByText("Бизнес-конверсия, %",{exact:true}).locator("..").innerText(),/Не настроено/);
  await page.goto("http://127.0.0.1:3000/settings",{waitUntil:"networkidle"});
  for(const [id,type] of Object.entries(fixture.types))await page.locator(`select[name="goalType_${id}"]`).selectOption(type as string);
  await page.getByRole("button",{name:"Сохранить типы целей",exact:true}).click();
  await page.getByRole("status").filter({hasText:"Типы целей сохранены"}).waitFor();
  assert.deepEqual(config((await db.integration.findUniqueOrThrow({where:{id:metrika.id}})).configJson).goalTypes,fixture.types);
  await page.reload({waitUntil:"networkidle"});
  for(const [id,type] of Object.entries(fixture.types))assert.equal(await page.locator(`select[name="goalType_${id}"]`).inputValue(),type);
  await page.screenshot({path:"test-results/sprint3-1-settings.png",fullPage:false});
  await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle"});
  assert.match(await page.getByText("Бизнес-конверсия, %",{exact:true}).locator("..").innerText(),/4,4/);
  for(const route of [`/pages/${fixture.pageId}`,`/opportunities/${fixture.opportunityId}`]){
    const response=await page.goto(`http://127.0.0.1:3000${route}`,{waitUntil:"networkidle"});assert.equal(response?.status(),200);
    for(const heading of ["Бизнес-конверсии","Микроконверсии","Навигационные действия"])await page.getByRole("heading",{name:heading,exact:true}).waitFor();
    assert.match(await page.getByRole("heading",{name:"Микроконверсии",exact:true}).locator("..").innerText(),/50/);
    assert.match(await page.getByRole("heading",{name:"Навигационные действия",exact:true}).locator("..").innerText(),/5.?600/);
  }
  await page.screenshot({path:"test-results/sprint3-1-detail.png",fullPage:false});
  const history=await db.opportunity.findUniqueOrThrow({where:{id:fixture.historicalOpportunityId}}),before=JSON.stringify(history.evidenceJson);
  await page.goto(`http://127.0.0.1:3000/opportunities/${history.id}`,{waitUntil:"networkidle"});
  assert.match(await page.locator("main").innerText(),/Исторический расчёт использовал общие цели/);
  assert.match(await page.locator("main").innerText(),/не подтверждена последним расчётом/);
  await page.goto("http://127.0.0.1:3000/opportunities",{waitUntil:"networkidle"});
  const count=await db.opportunity.count({where:{siteId:site.id}});
  await page.getByRole("button",{name:"Пересчитать возможности",exact:true}).click();
  await page.waitForURL(/message=/);await page.waitForLoadState("networkidle");
  assert.equal(await db.opportunity.count({where:{siteId:site.id}}),count);
  assert.equal(JSON.stringify((await db.opportunity.findUniqueOrThrow({where:{id:history.id}})).evidenceJson),before);
  writeFileSync("test-results/sprint3-1-ui.json",JSON.stringify({status:"PASS",defaultIgnore:true,typePersistence:true,dashboardBusinessRate:4.4,page360Groups:true,detailGroups:true,historyVisible:true,repeatedRecalculation:true,productionJobsStarted:false},null,2));
  console.log("PASS: goal selectors persist, unconfigured/typed dashboard, grouped Page 360/detail, visible history and repeat on local fixture.");
} finally {
  await db.integration.update({where:{id:metrika.id},data:{configJson:json(metrika.configJson)}});
  await db.integration.update({where:{id:target.id},data:{configJson:json(target.configJson)}});
  await browser.close();await db.$disconnect();
}
