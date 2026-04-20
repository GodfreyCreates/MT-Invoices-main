import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";

type AppHandler = (req: IncomingMessage, res: ServerResponse) => unknown;
type LegacyServerModule = {
  createApp?: () => Promise<AppHandler>;
};

let legacyAppPromise: Promise<AppHandler> | null = null;

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

async function getLegacyApp() {
  if (!legacyAppPromise) {
    legacyAppPromise = Promise.resolve()
      .then(() => {
        const require = createRequire(import.meta.url);
        const serverModule = require("../dist/server.cjs") as LegacyServerModule;

        if (typeof serverModule.createApp !== "function") {
          throw new Error("Legacy server bundle is missing createApp");
        }

        return serverModule.createApp();
      })
      .catch((error) => {
        legacyAppPromise = null;
        throw error;
      });
  }

  return legacyAppPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  restoreApiPathFromRewrite(req);
  const legacyApp = await getLegacyApp();
  return legacyApp(req, res);
}
