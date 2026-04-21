declare module "../dist/server.cjs" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  type AppHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

  export function createApp(): Promise<AppHandler>;
}
