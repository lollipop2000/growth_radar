import 'server-only';
import {mkdirSync,lstatSync,chmodSync,openSync,closeSync,writeFileSync,readFileSync,renameSync,unlinkSync,readdirSync,fsyncSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,join,relative,isAbsolute,dirname,parse} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {scrub} from './redact';
export const TTL_MS=24*60*60*1000,MAX_ARTIFACT_BYTES=262144;
export const DIAGNOSTIC_ROOT=join(homedir(),'.growth-radar-local-ai-diagnostics');
const workspace=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
export class DiagnosticError extends Error{constructor(readonly code:string){super(code);}}
export function assertLocal(env:NodeJS.ProcessEnv=process.env){if(env.NODE_ENV==='production'||env.GROWTH_RADAR_DEPLOYMENT==='production'||env.VERCEL||env.NETLIFY||env.K_SERVICE||env.WEBSITE_INSTANCE_ID||env.CI==='true')throw new DiagnosticError('DIAGNOSTICS_FORBIDDEN_IN_DEPLOYMENT');}
const within=(root:string,path:string)=>{const rel=relative(root,path);return rel===''||!rel.startsWith('..')&&!isAbsolute(rel);};
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function noLinks(path:string){let at=resolve(path);for(;;){try{if(lstatSync(at).isSymbolicLink())throw new DiagnosticError('UNSAFE_STORAGE_LINK');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const parent=dirname(at);if(parent===at)break;at=parent;}}
export function securePermissions(path:string,verify=false){
 if(process.platform==='win32'){
  const script=fileURLToPath(new URL('../../../scripts/ai-diagnostic-acl.ps1',import.meta.url));
  const result=spawnSync(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Path',path,...verify?['-Verify']:[]],{encoding:'utf8',windowsHide:true,timeout:15000});
  if(result.status!==0||result.stdout.trim()!=='ACL_OK')throw new DiagnosticError('SECURE_STORAGE_UNAVAILABLE');
 }else{
  if(!verify)chmodSync(path,lstatSync(path).isDirectory()?0o700:0o600);
  const stat=lstatSync(path);if(stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0)throw new DiagnosticError('SECURE_STORAGE_UNAVAILABLE');
 }
}
export class DiagnosticStorage{
 readonly root:string;
 constructor(root=DIAGNOSTIC_ROOT,private readonly now=()=>Date.now(),private readonly permissions=securePermissions){
  assertLocal();this.root=resolve(root);
  if(within(workspace,this.root)||this.root===parse(this.root).root||this.root===resolve(homedir()))throw new DiagnosticError('UNSAFE_STORAGE_LOCATION');
 }
 prepare(){assertLocal();noLinks(this.root);let exists=true;try{if(!lstatSync(this.root).isDirectory())throw new DiagnosticError('UNSAFE_STORAGE_LOCATION');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;exists=false;}
  if(!exists){mkdirSync(this.root,{recursive:true,mode:0o700});this.permissions(this.root);}this.permissions(this.root,true);}
 private path(runId:string){if(!idPattern.test(runId))throw new DiagnosticError('INVALID_RUN_ID');const p=resolve(this.root,runId+'.json');if(dirname(p)!==this.root)throw new DiagnosticError('UNSAFE_STORAGE_LOCATION');return p;}
 private checkFile(path:string){noLinks(path);const s=lstatSync(path);if(!s.isFile()||s.nlink!==1||s.size>MAX_ARTIFACT_BYTES)throw new DiagnosticError('UNSAFE_ARTIFACT_FILE');this.permissions(path,true);}
 write<T extends {runId:string;createdAt:string;expiresAt:string}>(artifact:T){
  this.prepare();const path=this.path(artifact.runId);this.checkTimes(artifact);
  try{this.checkFile(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(Buffer.byteLength(JSON.stringify(artifact))>MAX_ARTIFACT_BYTES)throw new DiagnosticError('ARTIFACT_TOO_LARGE');
  const bytes=JSON.stringify(scrub(artifact),null,2);if(Buffer.byteLength(bytes)>MAX_ARTIFACT_BYTES)throw new DiagnosticError('ARTIFACT_TOO_LARGE');
  const temp=join(this.root,randomUUID()+'.tmp');let fd:number|undefined;
  try{fd=openSync(temp,'wx',0o600);closeSync(fd);fd=undefined;this.permissions(temp);this.permissions(temp,true);fd=openSync(temp,'r+');writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temp,path);this.checkFile(path);}
  finally{if(fd!==undefined)closeSync(fd);try{unlinkSync(temp);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new DiagnosticError('ARTIFACT_CLEANUP_FAILED');}}
  return path;
 }
 private checkTimes(a:{createdAt:string;expiresAt:string}){const created=Date.parse(a.createdAt),expires=Date.parse(a.expiresAt);if(!Number.isFinite(created)||!Number.isFinite(expires)||expires-created!==TTL_MS||created>this.now()+300000)throw new DiagnosticError('INVALID_ARTIFACT_TTL');}
 read<T extends {runId:string;createdAt:string;expiresAt:string}>(runId:string):T{
  assertLocal();this.prepare();const path=this.path(runId);this.checkFile(path);let a:T;try{a=JSON.parse(readFileSync(path,'utf8'));}catch{throw new DiagnosticError('INVALID_ARTIFACT');}
  this.checkTimes(a);if(a.runId!==runId)throw new DiagnosticError('INVALID_ARTIFACT');if(Date.parse(a.expiresAt)<=this.now()){unlinkSync(path);throw new DiagnosticError('ARTIFACT_EXPIRED');}return a;
 }
 cleanup(all=false){this.prepare();let removed=0;for(const name of readdirSync(this.root)){
  const p=resolve(this.root,name);if(dirname(p)!==this.root)throw new DiagnosticError('UNSAFE_STORAGE_LOCATION');
  if(name.endsWith('.tmp')&&idPattern.test(name.slice(0,-4))){noLinks(p);const s=lstatSync(p);if(!s.isFile()||s.nlink!==1)throw new DiagnosticError('UNSAFE_ARTIFACT_FILE');if(all||s.mtimeMs+TTL_MS<=this.now()){unlinkSync(p);removed++;}continue;}
  const runId=name.replace(/\.json$/,'');if(!idPattern.test(runId)||name!==runId+'.json')throw new DiagnosticError('UNEXPECTED_STORAGE_ENTRY');
  this.checkFile(p);let a:{createdAt:string;expiresAt:string};try{a=JSON.parse(readFileSync(p,'utf8'));}catch{throw new DiagnosticError('INVALID_ARTIFACT');}this.checkTimes(a);
  if(all||Date.parse(a.expiresAt)<=this.now()){unlinkSync(p);removed++;}
 }return removed;}
}
