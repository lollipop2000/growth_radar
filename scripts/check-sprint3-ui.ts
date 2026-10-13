import {chromium} from "playwright";
import {writeFileSync,readFileSync} from "node:fs";
import {db} from "../src/lib/db";
import {currentSite,json} from "../src/lib/yandex/settings";
const site=await currentSite(),fixture=JSON.parse(readFileSync("test-results/sprint3-acceptance.json","utf8"));
const coverage=await db.scan.findFirst({where:{siteId:site.id,mode:"METRIKA_COVERAGE"},orderBy:{startedAt:"desc"}});
const opportunity=await db.opportunity.findFirst({where:{siteId:site.id},orderBy:{score:"desc"}});
const page360=opportunity?.pageId??(await db.page.findFirst({where:{siteId:site.id}}))?.id;
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const paths=["/","/pages","/scanner","/settings","/system","/metrika","/webmaster","/webmaster/priority","/webmaster/import","/seo-actions","/unmatched","/unmatched?view=ROWS&source=METRIKA","/imports","/business-data","/opportunities",...(page360?[`/pages/${page360}`]:[]),...(coverage?[`/scanner/${coverage.id}`]:[]),...(opportunity?[`/opportunities/${opportunity.id}`]:[])],results:{route:string;status:string;english:string[];overflow:boolean}[]=[];
try{
  for(const route of paths){const response=await page.goto(`http://127.0.0.1:3000${route}`,{waitUntil:"networkidle",timeout:60000});if(response?.status()!==200)throw new Error(`Route unavailable: ${route}`);
    const strings=await page.locator("h1,h2,h3,button,label,th,nav a,dt,.badge,summary,[role=status],select option").evaluateAll(elements=>elements.filter(e=>(!e.closest("details")||e.tagName==="SUMMARY")&&!e.matches("[data-source-value]")).map(e=>{const clone=e.cloneNode(true) as HTMLElement;clone.querySelectorAll("[data-source-value]").forEach(v=>v.remove());return (clone.textContent??"").trim();}));
    const english=strings.filter(text=>/[a-z]/i.test(text.replace(/https?:\/\/\S+/g,"").replace(/\b(?:URL|HTTP|API|SKU|CTR|SEO|WAF|XLSX|CSV|XLS|UTF-8|TLS|POST|TOP|PostgreSQL|Excel)\b/gi,"")));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
    results.push({route,status:english.length?"FAIL":"PASS",english,overflow});
    if(route==="/"||route==="/opportunities"||route.startsWith("/opportunities/"))await page.screenshot({path:`test-results/sprint3-${route==="/"?"dashboard":route==="/opportunities"?"opportunities":"detail"}.png`,fullPage:false});
  }
  writeFileSync("test-results/sprint3-localization.json",JSON.stringify({results,checkedAt:new Date().toISOString()},null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await db.$disconnect();}
if(results.some(r=>r.status==="FAIL"))process.exitCode=1;

