import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";

const SUPABASE_FUNCTION_PATH = "/functions/v1/app-api";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const LEGACY_PDF_PATH_PATTERNS = [
  /^\/api\/invoices\/pdf(?:\?|$)/,
  /^\/api\/invoices\/[^/]+\/pdf(?:\?|$)/,
  /^\/api\/invoices\/export\/render(?:\?|$)/,
] as const;

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

function getSupabaseFunctionOrigin() {
  const rawOrigin =
    process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";

  if (!rawOrigin) {
    throw new Error("Missing required environment variable: VITE_SUPABASE_URL");
  }

  return rawOrigin.replace(/\/+$/, "");
}

function getForwardedProto(req: IncomingMessage) {
  const encrypted = typeof (req.socket as { encrypted?: boolean }).encrypted === "boolean"
    ? (req.socket as { encrypted?: boolean }).encrypted
    : false;
  return encrypted ? "https" : "http";
}

function getProxyPath(req: IncomingMessage) {
  const parsedUrl = new URL(req.url ?? "/api", "http://vercel.local");
  const apiPath = parsedUrl.pathname.replace(/^\/api/, "") || "/";
  return `${apiPath}${parsedUrl.search}`;
}

function shouldUseLegacyPdfHandler(req: IncomingMessage) {
  const requestUrl = req.url ?? "/api";
  return LEGACY_PDF_PATH_PATTERNS.some((pattern) => pattern.test(requestUrl));
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

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function createForwardHeaders(req: IncomingMessage, requestId: string) {
  const headers = new Headers();

  for (const [headerName, headerValue] of Object.entries(req.headers)) {
    if (typeof headerValue === "undefined") {
      continue;
    }

    const normalizedHeaderName = headerName.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedHeaderName)) {
      continue;
    }

    if (Array.isArray(headerValue)) {
      for (const value of headerValue) {
        headers.append(headerName, value);
      }
      continue;
    }

    headers.set(headerName, headerValue);
  }

  headers.set("x-request-id", requestId);

  if (!headers.has("x-forwarded-host") && req.headers.host) {
    headers.set("x-forwarded-host", req.headers.host);
  }

  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", getForwardedProto(req));
  }

  return headers;
}

function copyResponseHeaders(upstreamResponse: Response, res: ServerResponse) {
  upstreamResponse.headers.forEach((headerValue, headerName) => {
    if (HOP_BY_HOP_HEADERS.has(headerName.toLowerCase())) {
      return;
    }

    res.setHeader(headerName, headerValue);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const requestId =
    typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].trim()
      ? req.headers["x-request-id"].trim()
      : randomUUID();

  res.setHeader("x-request-id", requestId);

  try {
    restoreApiPathFromRewrite(req);

    if (shouldUseLegacyPdfHandler(req)) {
      const legacyApp = await getLegacyApp();
      return legacyApp(req, res);
    }

    const upstreamUrl = new URL(SUPABASE_FUNCTION_PATH, getSupabaseFunctionOrigin());
    upstreamUrl.searchParams.set("path", getProxyPath(req));

    const body =
      req.method && ["GET", "HEAD"].includes(req.method.toUpperCase())
        ? undefined
        : await readRequestBody(req);

    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method ?? "GET",
      headers: createForwardHeaders(req, requestId),
      body,
    });

    copyResponseHeaders(upstreamResponse, res);
    res.statusCode = upstreamResponse.status;

    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
    res.end(responseBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to proxy API request";

    console.error(`[${requestId}] API proxy failed`, error);

    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: message.includes("Missing required environment variable")
          ? message
          : "Failed to proxy API request",
        requestId,
      }),
    );
  }
}
