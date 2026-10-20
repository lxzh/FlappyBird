import type { IncomingMessage, ServerResponse } from "node:http";
import { createApiWithDatabase } from "../server/app.ts";
import { createRemoteDatabase } from "../server/remote-database.ts";

let api: ReturnType<typeof createApiWithDatabase> | undefined;
export function resolveApiUrl(req: IncomingMessage) {
  const url = new URL(req.url || "/", "https://localhost");
  const query = (
    req as IncomingMessage & { query?: Record<string, string | string[]> }
  ).query;
  const value = url.searchParams.get("route") || query?.route;
  const endpoint = Array.isArray(value) ? value[0] : value;
  if (!endpoint) return req.url || "/";
  url.searchParams.delete("route");
  return `/api/${endpoint}${url.search}`;
}
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  // vercel.json routes every /api/:endpoint to this single function.
  req.url = resolveApiUrl(req);
  try {
    api ||= createApiWithDatabase(createRemoteDatabase(), 0, true);
    if (!(await api.handle(req, res))) {
      res.writeHead(404);
      res.end();
    }
  } catch {
    // Configuration errors never expose credentials or connection strings.
    res.writeHead(503, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        error: "云端服务未就绪，请检查 Turso 数据库环境变量和连接状态",
      }),
    );
  }
}
