import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, randomInt, createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import { replay, WORLD, type Submission } from "../shared/game.ts";
import { createDatabase } from "./database.ts";
import type { GameDatabase } from "./types.ts";
import { dayStart } from "./schema.ts";

type Client = { response: ServerResponse; playerId: string };
const ID = /^[\w-]{8,80}$/;
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
async function body(req: IncomingMessage) {
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined) {
    if (JSON.stringify(parsed).length > 128_000) fail(413, "数据过大");
    if (typeof parsed !== "string") return parsed;
    try {
      return JSON.parse(parsed);
    } catch {
      fail(400, "无效的 JSON");
    }
  }
  let data = "";
  req.setEncoding("utf8");
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 128_000) fail(413, "数据过大");
  }
  try {
    return JSON.parse(data);
  } catch {
    fail(400, "无效的 JSON");
  }
}
function identity(input: Record<string, unknown>) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail(400, "无效的玩家资料");
  if (typeof input.playerId !== "string" || !ID.test(input.playerId))
    fail(400, "无效的玩家标识");
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    [...input.name.trim()].length > 16 ||
    /[\p{Cc}\p{Cf}]/u.test(input.name)
  )
    fail(400, "昵称需要 1–16 个字符");
  return { id: input.playerId as string, name: (input.name as string).trim() };
}
export function createApi(databasePath: string, port: number) {
  return createApiWithDatabase(createDatabase(databasePath), port);
}
export function createApiWithDatabase<D extends GameDatabase>(
  database: D,
  port: number,
  serverless = false,
) {
  const clients = new Set<Client>();
  let closed = false;
  const requests = new Map<string, { count: number; until: number }>();
  const online = () => new Set([...clients].map((c) => c.playerId)).size;
  const broadcast = async () => {
    if (closed || serverless) return;
    const message = `event: snapshot\ndata: ${JSON.stringify(await database.snapshot(online()))}\n\n`;
    for (const c of clients)
      if (!c.response.destroyed) c.response.write(message);
  };
  let lastDay = dayStart();
  const heartbeat = serverless
    ? undefined
    : setInterval(() => {
        const day = dayStart();
        if (day !== lastDay) {
          lastDay = day;
          void broadcast().catch(console.error);
        }
        for (const c of clients) c.response.write(": heartbeat\n\n");
        for (const [key, value] of requests)
          if (value.until < Date.now()) requests.delete(key);
      }, 15_000);
  heartbeat?.unref();
  function json(res: ServerResponse, code: number, data: unknown) {
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  }
  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    const url = new URL(req.url || "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) return false;
    try {
      // Only same-origin browser mutations; no permissive CORS.
      if (req.method === "POST") {
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        )
          fail(403, "仅允许同源请求");
        if (!req.headers["content-type"]?.startsWith("application/json"))
          fail(415, "需要 JSON 数据");
        const address = serverless
          ? String(
              req.headers["x-forwarded-for"] ||
                req.socket.remoteAddress ||
                "unknown",
            )
              .split(",")[0]
              .trim()
          : req.socket.remoteAddress || "unknown";
        const key = createHash("sha256").update(address).digest("hex");
        if (database.allowRequest) {
          if (!(await database.allowRequest(key)))
            fail(429, "请求太频繁，请稍后再试");
        } else {
          let rate = requests.get(key);
          if (!rate || rate.until < Date.now()) {
            rate = { count: 0, until: Date.now() + 60_000 };
            requests.set(key, rate);
          }
          if (++rate.count > 240) fail(429, "请求太频繁，请稍后再试");
        }
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        await database.health?.();
        json(res, 200, { ok: true });
      } else if (req.method === "GET" && url.pathname === "/api/info") {
        const addresses = serverless
          ? []
          : Object.values(networkInterfaces())
              .flat()
              .filter((a) => a && a.family === "IPv4" && !a.internal)
              .map((a) => `http://${a!.address}:${port}`);
        json(res, 200, {
          addresses,
          port,
          mode: serverless ? "public" : "lan",
          transport: serverless ? "poll" : "sse",
          pollInterval: 10000,
        });
      } else if (req.method === "GET" && url.pathname === "/api/leaderboard")
        json(res, 200, await database.snapshot(online()));
      else if (req.method === "GET" && url.pathname === "/api/events") {
        if (serverless) fail(405, "云端请使用定时刷新接口");
        const playerId = url.searchParams.get("playerId") || "";
        if (!ID.test(playerId)) fail(400, "无效的玩家标识");
        if (clients.size >= 250) fail(503, "房间暂时已满");
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write("retry: 2500\n\n");
        const client = { response: res, playerId };
        clients.add(client);
        await broadcast();
        res.on("close", () => {
          clients.delete(client);
          void broadcast().catch(console.error);
        });
      } else if (
        req.method === "POST" &&
        url.pathname === "/api/presence" &&
        serverless
      ) {
        const player = identity(await body(req));
        await database.touch?.(player.id);
        json(res, 200, await database.snapshot(0));
      } else if (req.method === "POST" && url.pathname === "/api/profile") {
        const player = identity(await body(req));
        await database.player(player.id, player.name);
        await broadcast();
        json(res, 200, { ok: true });
      } else if (req.method === "POST" && url.pathname === "/api/runs") {
        const player = identity(await body(req));
        await database.player(player.id, player.name);
        const run = {
          id: randomUUID(),
          seed: randomInt(1, 0xffffffff),
          startedAt: Date.now(),
        };
        await database.newRun(run.id, player.id, run.seed, run.startedAt);
        json(res, 201, run);
      } else if (req.method === "POST" && url.pathname === "/api/scores") {
        const input = (await body(req)) as Submission;
        const player = identity(input as unknown as Record<string, unknown>);
        if (typeof input.runId !== "string") fail(400, "缺少游戏记录");
        const run = await database.getRun(input.runId);
        if (!run || run.player_id !== player.id) fail(404, "未找到本局游戏");
        if (run.score !== null) {
          json(res, 200, { ok: true, duplicate: true, score: run.score });
          return true;
        }
        if (
          !Number.isInteger(input.ticks) ||
          input.ticks < 1 ||
          input.ticks > WORLD.maxTicks ||
          !Number.isInteger(input.score) ||
          input.score < 0
        )
          fail(400, "无效的成绩");
        if (
          !Array.isArray(input.flaps) ||
          input.flaps.length > input.ticks ||
          !input.flaps.every(
            (tick, i) =>
              Number.isInteger(tick) &&
              tick >= 0 &&
              tick < input.ticks &&
              (i === 0 || tick > input.flaps[i - 1]),
          )
        )
          fail(400, "无效的操作记录");
        if ((input.ticks / 60) * 1000 > Date.now() - run.started_at + 1800)
          fail(422, "游戏时长校验未通过");
        const verified = replay(run.seed, input.flaps, input.ticks);
        if (
          verified.alive ||
          verified.tick !== input.ticks ||
          verified.score !== input.score
        )
          fail(422, "成绩回放校验未通过");
        await database.player(player.id, player.name);
        await database.save(input);
        await broadcast();
        json(res, 201, { ok: true, score: verified.score });
      } else json(res, 404, { error: "接口不存在" });
    } catch (error) {
      const e = error as Error & { status?: number };
      if (!e.status) console.error(e);
      if (!res.headersSent)
        json(res, e.status || 500, {
          error: e.status ? e.message : "服务器暂时不可用",
        });
      else res.end();
    }
    return true;
  }
  return {
    handle,
    database,
    broadcast,
    close() {
      closed = true;
      clearInterval(heartbeat);
      for (const c of clients) c.response.end();
      clients.clear();
      database.close();
    },
  };
}
