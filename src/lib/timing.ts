import 'server-only';
import {performance} from 'node:perf_hooks';
export type TimingBlock='site'|'db'|'commerce'|'search'|'seo'|'quality'|'render-prep';
/** Development only; fixed labels, duration only, never parameters or results. */
export async function timed<T>(block:TimingBlock,read:()=>Promise<T>):Promise<T>{const start=performance.now();try{return await read();}finally{if(process.env.NODE_ENV==='development')console.info(`[server-timing] ${block} ${Math.round(performance.now()-start)}ms`);}}
