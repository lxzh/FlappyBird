import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { IncomingMessage } from "node:http";
import { resolveApiUrl } from "../api/game.ts";
import { getTursoConfig, getLeaderboardTimezone } from "../server/config.ts";

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
  const env = {
    ...process.env,
    TURSO_DATABASE_URL: "",
    TURSO_AUTH_TOKEN: "",
    FLAPPY_BIRD_TURSO_DATABASE_URL: "",
    FLAPPY_BIRD_TURSO_AUTH_TOKEN: "",
    LEADERBOARD_TIMEZONE: "",
  };
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
  const prefixed = check({
    FLAPPY_BIRD_TURSO_DATABASE_URL: "libsql://prefixed.example",
    FLAPPY_BIRD_TURSO_AUTH_TOKEN: secret,
  });
  assert.equal(prefixed.status, 0);
  assert.ok(!`${prefixed.stdout}${prefixed.stderr}`.includes(secret));
  assert.equal(
    check({
      FLAPPY_BIRD_TURSO_DATABASE_URL: "libsql://prefixed.example",
      TURSO_AUTH_TOKEN: secret,
    }).status,
    1,
  );
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
    0,
  );
  assert.equal(
    check({
      FLAPPY_BIRD_TURSO_DATABASE_URL: "libsql://prefixed.example",
      FLAPPY_BIRD_TURSO_AUTH_TOKEN: secret,
      TZ: ":UTC",
      VERCEL: "1",
    }).status,
    0,
  );
  assert.equal(
    check({
      TURSO_DATABASE_URL: "https://test.example",
      TURSO_AUTH_TOKEN: secret,
      LEADERBOARD_TIMEZONE: "Invalid/Timezone",
    }).status,
    1,
  );
});

test("leaderboard timezone ignores host TZ and validates only its own explicit setting", () => {
  for (const TZ of [
    ":UTC",
    ":/etc/localtime",
    "UTC",
    "Invalid/Timezone",
    " ",
  ]) {
    assert.equal(getLeaderboardTimezone({ TZ }), "Asia/Shanghai");
  }
  assert.equal(
    getLeaderboardTimezone({ LEADERBOARD_TIMEZONE: " UTC\n", TZ: ":UTC" }),
    "UTC",
  );
  assert.throws(
    () => getLeaderboardTimezone({ LEADERBOARD_TIMEZONE: "Invalid/Timezone" }),
    /LEADERBOARD_TIMEZONE/,
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
    "FLAPPY_BIRD_TURSO_DATABASE_URL,FLAPPY_BIRD_TURSO_AUTH_TOKEN",
  );
});

test("runtime config prefers the complete prefixed pair and preserves legacy compatibility", () => {
  const legacy = {
    TURSO_DATABASE_URL: "libsql://legacy.example",
    TURSO_AUTH_TOKEN: "legacy-token",
  };
  assert.deepEqual(getTursoConfig(legacy), {
    url: "libsql://legacy.example",
    authToken: "legacy-token",
  });
  assert.deepEqual(
    getTursoConfig({
      ...legacy,
      FLAPPY_BIRD_TURSO_DATABASE_URL: " https://prefixed.example ",
      FLAPPY_BIRD_TURSO_AUTH_TOKEN: " prefixed-token ",
    }),
    { url: "https://prefixed.example", authToken: "prefixed-token" },
  );
  assert.deepEqual(
    getTursoConfig({
      ...legacy,
      FLAPPY_BIRD_TURSO_DATABASE_URL: "  ",
      FLAPPY_BIRD_TURSO_AUTH_TOKEN: "",
    }),
    { url: "libsql://legacy.example", authToken: "legacy-token" },
  );
});

test("runtime config rejects mixed credentials and malformed prefixed URLs without leaking secrets", () => {
  assert.throws(
    () =>
      getTursoConfig({
        FLAPPY_BIRD_TURSO_DATABASE_URL: "libsql://prefixed.example",
        TURSO_AUTH_TOKEN: "legacy-token",
      }),
    /FLAPPY_BIRD_TURSO_AUTH_TOKEN/,
  );
  assert.throws(
    () =>
      getTursoConfig({
        TURSO_DATABASE_URL: "libsql://legacy.example",
        TURSO_AUTH_TOKEN: "legacy-token",
        FLAPPY_BIRD_TURSO_AUTH_TOKEN: "prefixed-token",
      }),
    /FLAPPY_BIRD_TURSO_DATABASE_URL/,
  );
  const secret = "secret-must-not-appear";
  assert.throws(
    () =>
      getTursoConfig({
        FLAPPY_BIRD_TURSO_DATABASE_URL: `file:${secret}`,
        FLAPPY_BIRD_TURSO_AUTH_TOKEN: secret,
      }),
    (error: Error) =>
      error.message.includes("FLAPPY_BIRD_TURSO_DATABASE_URL") &&
      !error.message.includes(secret),
  );
});
