import { test } from "node:test";
import assert from "node:assert/strict";
import type { Submission } from "../shared/game.ts";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: Object.assign(new EventTarget(), {
    localStorage: globalThis.localStorage,
  }),
});
const { useGameStore } = await import("../src/store.ts");
const { syncScores, connect } = await import("../src/api.ts");
const submission: Submission = {
  runId: "queued-run-1",
  playerId: useGameStore.getState().playerId,
  name: "Pilot",
  score: 2,
  ticks: 300,
  flaps: [0, 30],
};

test("client durably queues network failures, then retries and clears acknowledged scores", async () => {
  const originalFetch = globalThis.fetch;
  try {
    useGameStore.getState().set({ pending: [], name: "New nickname" });
    useGameStore.getState().enqueue(submission);
    globalThis.fetch = async () => {
      throw new TypeError("Network disconnected");
    };
    await syncScores();
    assert.equal(useGameStore.getState().syncState, "pending");
    assert.equal(useGameStore.getState().pending.length, 1);
    assert.equal(
      JSON.parse(storage.get("flappy-club-v1")!).state.pending[0].runId,
      submission.runId,
    );
    let requests = 0;
    globalThis.fetch = async (_url, options) => {
      requests++;
      assert.equal(JSON.parse(options!.body as string).name, "New nickname");
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
      });
    };
    await syncScores();
    assert.equal(useGameStore.getState().syncState, "saved");
    assert.equal(useGameStore.getState().pending.length, 0);
    assert.equal(
      JSON.parse(storage.get("flappy-club-v1")!).state.pending.length,
      0,
    );
    await syncScores();
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("client keeps rate-limited scores for retry and reports rejected replays", async () => {
  const originalFetch = globalThis.fetch;
  try {
    useGameStore.getState().enqueue(submission);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
      });
    await syncScores();
    assert.equal(useGameStore.getState().pending.length, 1);
    assert.equal(useGameStore.getState().syncState, "pending");
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Invalid replay" }), {
        status: 422,
      });
    await syncScores();
    assert.equal(useGameStore.getState().pending.length, 0);
    assert.equal(useGameStore.getState().syncState, "error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public connection uses polling and retries queued scores without a tight request loop", async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const documentMock = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock,
  });
  let disconnect: (() => void) | undefined;
  let presenceCalls = 0,
    scoreCalls = 0;
  const snapshot = {
    all: [],
    today: [],
    online: 1,
    totalGames: 0,
    totalPlayers: 0,
    serverTime: Date.now(),
  };
  try {
    useGameStore.getState().set({ pending: [], connected: false });
    useGameStore.getState().enqueue(submission);
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/info"))
        return Response.json({
          mode: "public",
          transport: "poll",
          addresses: [],
          pollInterval: 10000,
        });
      if (String(url).endsWith("/presence")) {
        presenceCalls++;
        return Response.json(snapshot);
      }
      scoreCalls++;
      throw new TypeError("Network disconnected during score upload");
    };
    disconnect = connect();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(useGameStore.getState().mode, "public");
    assert.equal(useGameStore.getState().connected, true);
    assert.equal(presenceCalls, 1);
    assert.equal(scoreCalls, 1);
    documentMock.hidden = true;
    documentMock.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(presenceCalls, 1);
    documentMock.hidden = false;
    documentMock.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(presenceCalls, 2);
    assert.equal(scoreCalls, 2);
    disconnect();
    window.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(presenceCalls, 2);
  } finally {
    disconnect?.();
    globalThis.fetch = originalFetch;
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
