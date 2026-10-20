import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { IncomingMessage } from "node:http";
import { resolveApiUrl } from "../api/game.ts";

test("Vercel rewrite supports original URLs, destination query and pre-parsed platform query", () => {
  const request = (url: string, query?: Record<string, string | string[]>) =>
    ({ url, query }) as unknown as IncomingMessage;
  assert.equal(resolveApiUrl(request("/api/health")), "/api/health");
  assert.equal(resolveApiUrl(request("/api/game?route=runs")), "/api/runs");
  assert.equal(
    resolveApiUrl(request("/api/game?route=events&playerId=pilot-123")),
    "/api/events?playerId=pilot-123",
  );
  assert.equal(
    resolveApiUrl(request("/api/game", { route: "scores" })),
    "/api/scores",
  );
});
test("deployment configuration checks required variables without exposing their values", () => {
  const env = { ...process.env, TURSO_DATABASE_URL: "", TURSO_AUTH_TOKEN: "" };
  const check = (variables: Record<string, string>) =>
    spawnSync(process.execPath, ["scripts/check-deploy.mjs"], {
      encoding: "utf8",
      env: { ...env, ...variables },
    });
  assert.equal(check({}).status, 1);
  const secret = "test-only-token-should-not-be-printed";
  const valid = check({
    TURSO_DATABASE_URL: "libsql://test.example",
    TURSO_AUTH_TOKEN: secret,
    TZ: "Asia/Shanghai",
  });
  assert.equal(valid.status, 0);
  assert.ok(!`${valid.stdout}${valid.stderr}`.includes(secret));
  assert.equal(
    check({
      TURSO_DATABASE_URL: "file:temporary.sqlite",
      TURSO_AUTH_TOKEN: secret,
    }).status,
    1,
  );
  assert.equal(
    check({
      TURSO_DATABASE_URL: "https://test.example",
      TURSO_AUTH_TOKEN: secret,
      TZ: "Invalid/Timezone",
    }).status,
    1,
  );
});
test("deploy button includes the chosen repository and required database variables", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/deploy-link.mjs", "https://github.com/example/flappy-bird"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  const link = result.stdout.match(
    /\]\((https:\/\/vercel.com\/new\/clone\?[^)]+)\)/,
  )![1];
  const url = new URL(link);
  assert.equal(
    url.searchParams.get("repository-url"),
    "https://github.com/example/flappy-bird",
  );
  assert.equal(
    url.searchParams.get("env"),
    "TURSO_DATABASE_URL,TURSO_AUTH_TOKEN",
  );
});
