import type { IncomingMessage, ServerResponse } from "node:http";

type AppHandler = (req: IncomingMessage, res: ServerResponse) => unknown;
type AppServerModule = {
  createApp?: () => Promise<AppHandler>;
};

let appPromise: Promise<AppHandler> | null = null;

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

async function getApp() {
  if (!appPromise) {
    appPromise = Promise.resolve()
      .then(async () => {
        const serverModule = ((await import("../dist/server.cjs").catch(() => import("../server.ts"))) ??
          {}) as AppServerModule;

        if (typeof serverModule.createApp !== "function") {
          throw new Error("Server module is missing createApp");
        }

        return serverModule.createApp();
      })
      .catch((error) => {
        appPromise = null;
        throw error;
      });
  }

  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  restoreApiPathFromRewrite(req);
  const app = await getApp();
  return app(req, res);
}
