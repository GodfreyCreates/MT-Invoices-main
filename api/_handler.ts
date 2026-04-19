import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server";

let appPromise: ReturnType<typeof createApp> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }

  return appPromise;
}

function restoreApiPathFromRewrite(req: IncomingMessage) {
  const currentUrl = req.url ?? "/api";
  const parsedUrl = new URL(currentUrl, "http://vercel.local");
  const rewrittenPath = parsedUrl.searchParams.get("__pathname");

  if (!rewrittenPath) {
    return;
  }

  parsedUrl.searchParams.delete("__pathname");

  const normalizedPath = rewrittenPath.replace(/^\/+/, "");
  parsedUrl.pathname = normalizedPath ? `/api/${normalizedPath}` : "/api";

  const search = parsedUrl.searchParams.toString();
  req.url = `${parsedUrl.pathname}${search ? `?${search}` : ""}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  restoreApiPathFromRewrite(req);
  const app = await getApp();
  return app(req as never, res as never);
}
