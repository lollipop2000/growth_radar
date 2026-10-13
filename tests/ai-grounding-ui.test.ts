import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('V2 Page360 result rendering distinguishes CHECK/CHANGE, partial/all rejected/empty',()=>{
 const r=spawnSync(process.execPath,['--import=tsx','scripts/acceptance-ai-grounding-ui.tsx'],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.includes('PASS fixture UI'));
});
