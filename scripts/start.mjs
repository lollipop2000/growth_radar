import { cpSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import {superviseScanner} from './scanner-supervisor.mjs';
mkdirSync(".next/standalone/.next", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: process.env.HOSTNAME || "127.0.0.1" },
});
const scanner=process.env.SCANNER_WORKER_DISABLED==='1'?null:superviseScanner();
let stopping=false;
function stop(){if(stopping)return;stopping=true;scanner?.stop();child.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
child.on("exit", (code) => {scanner?.stop();process.exit(code ?? 1);});
