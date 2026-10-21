import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

// Vercel's Node builder transpiles with the nearest tsconfig and renames .ts
// files to .js. Exercise that exact layout without any original .ts files.
test("Vercel-style compiled function loads and serves info without a TypeScript loader", () => {
  const directory = mkdtempSync(join(tmpdir(), "flappy-vercel-package-"));
  try {
    const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
    const sources = [
      "api/game.ts",
      "server/app.ts",
      "server/config.ts",
      "server/database.ts",
      "server/remote-database.ts",
      "server/schema.ts",
      "server/types.ts",
      "shared/game.ts",
    ];
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    symlinkSync(
      resolve("node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    for (const file of sources) {
      const output = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file,
        compilerOptions: parsed.options,
      });
      const destination = join(directory, file.replace(/\.ts$/, ".js"));
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, output.outputText);
    }
    const entry = pathToFileURL(join(directory, "api/game.js")).href;
    const probe = `
      import handler from ${JSON.stringify(entry)};
      let status, body;
      const request = { url: '/api/game?route=info', method: 'GET', headers: {}, socket: {} };
      const response = { writeHead(code) { status = code; }, end(data) { body = data; } };
      await handler(request, response);
      if (status !== 200 || JSON.parse(body).mode !== 'public') throw new Error('Function info endpoint failed');
      console.log('Compiled function info: 200 public');
    `;
    const result = spawnSync(
      process.execPath,
      ["--no-experimental-strip-types", "--input-type=module", "-e", probe],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          FLAPPY_BIRD_TURSO_DATABASE_URL: "libsql://package-test.example",
          FLAPPY_BIRD_TURSO_AUTH_TOKEN: "test-only-no-network",
          LEADERBOARD_TIMEZONE: "",
          TZ: ":UTC",
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Compiled function info: 200 public/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
