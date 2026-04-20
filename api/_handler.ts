import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

type AppHandler = (req: IncomingMessage, res: ServerResponse) => unknown;
type ServerModule = {
  createApp?: () => Promise<AppHandler>;
};

let appPromise: Promise<AppHandler> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = Promise.resolve()
      .then(async () => {
        const serverModule = (await import("../server.ts")) as ServerModule;
        if (typeof serverModule.createApp !== "function") {
          throw new Error("Server module is missing createApp");
        }

        return serverModule.createApp();
      })
      .catch((error) => {
        appPromise = null;
        throw error;
      }) as Promise<AppHandler>;
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
  const requestId =
    typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].trim()
      ? req.headers["x-request-id"].trim()
      : randomUUID();
  res.setHeader("x-request-id", requestId);

  try {
    restoreApiPathFromRewrite(req);
    const app = await getApp();
    return app(req as never, res as never);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize API server";
    const isMissingEnv = message.includes("Missing required environment variable:");
    const responsePayload = {
      error: isMissingEnv ? message : "Failed to initialize API server",
      requestId,
    };

    console.error(`[${requestId}] API initialization failed`, error);

    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(responsePayload));
  }
}
