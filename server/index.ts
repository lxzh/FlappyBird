import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { networkInterfaces } from "node:os";
import { createApi } from "./app.ts";

process.env.TZ ||= "Asia/Shanghai";
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === "production";
const api = createApi(
  process.env.DATABASE_PATH || resolve("data/flappy.sqlite"),
  port,
);
const vite = production
  ? null
  : await (
      await import("vite")
    ).createServer({ server: { middlewareMode: true }, appType: "spa" });
const root = resolve("dist");
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  if (await api.handle(req, res)) return;
  if (vite) {
    vite.middlewares(req, res);
    return;
  }
  try {
    const requested = resolve(
      root,
      "." +
        decodeURIComponent(
          new URL(req.url || "/", "http://localhost").pathname,
        ),
    );
    if (requested !== root && !requested.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const file =
      existsSync(requested) && statSync(requested).isFile()
        ? requested
        : resolve(root, "index.html");
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
      "Cache-Control": file.includes(`${sep}assets${sep}`)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
  }
});
server.listen(port, "0.0.0.0", () => {
  console.log(
    `\n  FLAPPY BIRD · ${production ? "production" : "development"}\n  Local:   http://localhost:${port}`,
  );
  for (const addresses of Object.values(networkInterfaces()))
    for (const address of addresses || [])
      if (address.family === "IPv4" && !address.internal)
        console.log(`  Network: http://${address.address}:${port}`);
  console.log("");
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  api.close();
  await vite?.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
