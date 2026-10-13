// Read-only database history + local rendered UI. Never requests a target-site URL.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const id = process.argv[2];
  if (!id) throw new Error("Specify an existing Coverage scan ID.");
  const row = await db.scan.findUniqueOrThrow({where:{id},select:{configJson:true}});
  const c = row.configJson.coverage;
  const urls = [...c.queue.flatMap(q=>[q.url,...q.rawUrls,...(q.requestUrl?[q.requestUrl]:[])]),...c.excluded.map(q=>q.url),...(c.remainingUnmatched??[]).map(q=>q.url)];
  const secrets = new Set();
  for (const value of urls) {
    try { for (const [key,secret] of new URL(value).searchParams) if (/token|password|session|auth|secret|cookie/i.test(key) && secret.length>=8 && secret!=="REDACTED") secrets.add(secret); } catch {}
  }
  assert.ok(secrets.size>0,"Historical fixture/history must contain secret URL parameters to verify redaction.");
  for (const path of ["/scanner", "/scanner/"+encodeURIComponent(id)]) {
    const r=await fetch("http://127.0.0.1:3000"+path); assert.ok(r.ok);
    const html=await r.text();
    for (const secret of secrets) {
      assert.ok(!html.includes(secret) && !html.includes(encodeURIComponent(secret)),"Sensitive query value leaked into visible or serialized UI: " + path);
    }
  }
  console.log("PASS: historical sensitive query values absent from local Coverage HTML and serialized UI; no target-site requests.");
} finally { await db.$disconnect(); }
