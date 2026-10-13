import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {superviseScanner} from '../scripts/scanner-supervisor.mjs';
test('scanner supervisor starts worker, restarts after exit, and stops without respawning',()=>{
 let time=1000,count=0,kills=0;const children:EventEmitter[]=[];
 const s=superviseScanner({now:()=>time,readHealth:()=>({at:time}),onHealth:()=>{},onEvent:()=>{},spawnWorker:()=>{count++;const c=new EventEmitter() as any;c.kill=()=>{kills++;c.emit('exit',1);};children.push(c);return c;}});
 try{assert.equal(count,1);children[0].emit('exit',1);s.tick();assert.equal(count,1);time+=1000;s.tick();assert.equal(count,2);s.stop();time+=100000;s.tick();assert.equal(count,2);assert.equal(kills,1);}finally{s.stop();}
});
test('scanner supervisor recovers an expired worker heartbeat but keeps a fresh busy worker',()=>{
 let time=1000,kills=0;const s=superviseScanner({now:()=>time,readHealth:()=>({at:1000}),onHealth:()=>{},onEvent:()=>{},spawnWorker:()=>{const c=new EventEmitter() as any;c.kill=()=>{kills++;c.emit('exit',1);};return c;}});
 try{time+=80000;s.tick();assert.equal(kills,0);time+=20000;s.tick();assert.equal(kills,1);}finally{s.stop();}
});
