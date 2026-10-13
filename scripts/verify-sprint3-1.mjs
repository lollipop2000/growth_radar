import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("test-results/sprint3-1-checks", { recursive: true });
const tasks = [
  ["typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]],
  ["tests", ["--conditions=react-server", "--import=tsx", "--test", "tests/*.test.ts"]],
  ...["scanner", "worker", "coverage", "waf", "yandex", "sprint3", "sprint3-1"].map(name => [name+" regression", ["--env-file=.env", "--conditions=react-server", "--import=tsx", `scripts/acceptance-${name}.ts`]]),
  ["migration status", ["node_modules/prisma/build/index.js", "migrate", "status"]],
  ["schema drift", ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"]],
  ["clean database", ["--env-file=.env", "scripts/verify-clean-db.mjs"]],
];
const checks=[];
for(const [name,args] of tasks) {
  const start=Date.now(),result=spawnSync(process.execPath,args,{env:process.env,encoding:"utf8",maxBuffer:10_000_000});
  let output=(result.stdout??"")+(result.stderr??"");
  for(const key of ["DATABASE_URL","POSTGRES_PASSWORD","YANDEX_METRIKA_TOKEN","YANDEX_WEBMASTER_TOKEN","LLM_API_KEY"])if(process.env[key])output=output.split(process.env[key]).join("[redacted]");
  const check={name,status:result.status===0?"PASS":"FAIL",durationMs:Date.now()-start};checks.push(check);
  writeFileSync(`test-results/sprint3-1-checks/${name.replaceAll(" ","-")}.log`,output);
  writeFileSync("test-results/sprint3-1-checks.json",JSON.stringify(checks,null,2));console.log(JSON.stringify(check));
  if(result.status!==0){console.log(output.slice(-4000));process.exit(1);}
}
