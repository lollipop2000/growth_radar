// Read-only UI assertion; never invokes an action or requests the target site.
import assert from "node:assert/strict";
import { load } from "cheerio";
const response = await fetch("http://127.0.0.1:3000/scanner");
assert.ok(response.ok);
const html = await response.text();
const document = load(html);
assert.equal(document('input[name="delayMs"]').val(), "3000");
assert.equal(document('select[name="delayMs"]').first().find('option[selected]').val(), "3000");
console.log("PASS: local Scanner/Coverage UI defaults to 3-second pacing; no scan started.");
