import "server-only";
import { chromium } from "playwright";
import { readFile, stat } from "node:fs/promises";
import { ApiError } from "./api";
export async function browserDownloadExport(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "storage.mds.yandex.net" || u.username || u.password || !u.pathname.startsWith("/get-webmaster-download/"))
    throw new ApiError("MALFORMED_RESPONSE");
  const deadline = Date.now() + 20000;
  const browser = await chromium.launch({ headless: true, timeout: 20000 }).catch(() => { throw new ApiError("NETWORK"); });
  const timer = setTimeout(() => { void browser.close().catch(() => {}); }, Math.max(1, deadline - Date.now()));
  try {
    const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: "block" });
    await context.route("**/*", route => {
      const r = route.request();
      return ["GET", "HEAD"].includes(r.method()) && r.url() === u.href && !r.headers().authorization
        ? route.continue() : route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    const downloading = page.waitForEvent("download", { timeout: Math.max(1, deadline - Date.now()) });
    void page.goto(u.href, { timeout: Math.max(1, deadline - Date.now()) }).catch(() => {});
    const download = await downloading;
    if (await download.failure()) throw new ApiError("NETWORK");
    const path = await download.path();
    if (!path || (await stat(path)).size > 50 * 1024 * 1024) throw new ApiError("MALFORMED_RESPONSE");
    return await readFile(path);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("TIMEOUT");
  } finally { clearTimeout(timer); await browser.close(); }
}
