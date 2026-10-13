"use client";
import { t , ui } from "@/lib/i18n/ru";

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { coverageControlAction } from "@/app/scanner/coverage-actions";
export function CoverageControls({ id, status, delayMs = 3000 }: { id: string; status: string; delayMs?: number }) {
  const [state,action,pending] = useActionState(coverageControlAction,{ message: "" });
  return <form action={action}><input type="hidden" name="scanId" value={id}/>
    {["PENDING","RUNNING"].includes(status) && <button disabled={pending} name="control" value="PAUSE">{t("Pause")}</button>}
    {["PENDING","RUNNING","PAUSING","STOPPING","PAUSED"].includes(status) && <button disabled={pending} name="control" value="STOP">{t("Stop")}</button>}
    {["PAUSED","STOPPED","INTERRUPTED","FAILED"].includes(status) && <><label>{t("Пауза при Resume")}<select name="delayMs" defaultValue={Math.max(3000,delayMs)}>{[3,10,20,30,60].map(seconds=><option key={seconds} value={seconds*1000}>{seconds} {t("sec")}</option>)}</select></label><button disabled={pending} name="control" value="RESUME">{t("Resume")}</button></>}
    <p role="status">{ui(state.message)}</p></form>;
}
export function CoverageRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => { if (!active) return; const timer = setInterval(() => router.refresh(), 5000); return () => clearInterval(timer); }, [active, router]);
  return <button onClick={() => router.refresh()}>{t("Обновить progress")}</button>;
}
