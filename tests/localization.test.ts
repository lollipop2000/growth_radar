import test from "node:test";
import assert from "node:assert/strict";
import {t,ui,date,number,money} from "../src/lib/i18n/ru";
test("Navigation, statuses, scanner modes, page types and rule settings have central Russian labels",()=>{
  for(const key of ["Dashboard","Pages","Site Scanner","Yandex Webmaster","Yandex Metrika","Unmatched URLs","Excel Imports","Opportunities","Settings","System Status","RUNNING","COMPLETED","FAILED","PAUSED","WARNING","ERROR","NOT_CONFIGURED","SYNCING","MATCHED","UNMATCHED","product","category","BROWSER_ONLY","HTTP_BROWSER","config_minVisits","BUSINESS_CONVERSION","MICRO_CONVERSION","NAVIGATION","IGNORE","businessConversion","microConversion","businessGoalsMissing"]){const label=t(key);assert.notEqual(label,key,key);assert.match(label,/[а-я]/i,key);}
  assert.equal(t("HTTP"),"HTTP");assert.match(ui("NETWORK: Не удалось подключиться к API. Проверьте worker."),/исполнитель/);assert.ok(!ui("NETWORK: Не удалось подключиться к API.").startsWith("NETWORK"));assert.match(date("2026-10-01"),/01.10.2026/);assert.match(number(1.23),/1,23/);assert.match(money(10),/₽/);
});
