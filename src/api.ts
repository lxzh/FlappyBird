import { useGameStore } from "./store";
import type { Run, Snapshot, ConnectionInfo } from "../shared/game";
export async function post<T>(path: string, data: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(result.error || "请求失败"), {
      status: response.status,
    });
  return result;
}
export function newRun(): Promise<Run> {
  const { playerId, name } = useGameStore.getState();
  return post("runs", { playerId, name });
}
let syncing = false;
export async function syncScores() {
  if (syncing || !useGameStore.getState().pending.length) return;
  syncing = true;
  useGameStore.getState().set({ syncState: "syncing" });
  let rejected = false;
  let boardChanged = false;
  try {
    for (const item of [...useGameStore.getState().pending]) {
      try {
        await post("scores", { ...item, name: useGameStore.getState().name });
        useGameStore.getState().dequeue(item.runId);
        boardChanged = true;
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500 && status !== 429) {
          useGameStore.getState().dequeue(item.runId);
          rejected = true;
        } else throw error;
      }
    }
    useGameStore.getState().set({
      syncState: useGameStore.getState().pending.length
        ? "pending"
        : rejected
          ? "error"
          : "saved",
    });
  } catch {
    useGameStore.getState().set({ syncState: "pending" });
  } finally {
    syncing = false;
    if (
      boardChanged &&
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function"
    )
      window.dispatchEvent(new Event("flappy:refresh"));
  }
}
export function connect() {
  let disposed = false,
    inFlight = false;
  let source: EventSource | undefined;
  let info: ConnectionInfo | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function receive(snapshot: Snapshot) {
    if (disposed) return;
    const state = useGameStore.getState();
    const mine = snapshot.all.find((p) => p.id === state.playerId);
    state.set({
      connected: true,
      snapshot,
      best: Math.max(state.best, mine?.score || 0),
    });
    void syncScores();
  }
  async function tick() {
    if (disposed || inFlight) return;
    clearTimeout(timer);
    inFlight = true;
    try {
      if (!info) {
        const response = await fetch("/api/info", {
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("服务连接失败");
        info = (await response.json()) as ConnectionInfo;
        if (disposed) return;
        useGameStore
          .getState()
          .set({ mode: info.mode, addresses: info.addresses });
      }
      if (info.transport === "sse") {
        if (!source) {
          source = new EventSource(
            `/api/events?playerId=${encodeURIComponent(useGameStore.getState().playerId)}`,
          );
          source.addEventListener("snapshot", (event) =>
            receive(JSON.parse((event as MessageEvent).data)),
          );
          source.onerror = () => {
            if (!disposed) useGameStore.getState().set({ connected: false });
          };
        }
        if (useGameStore.getState().connected) void syncScores();
      } else if (!document.hidden) {
        const { playerId, name } = useGameStore.getState();
        receive(await post<Snapshot>("presence", { playerId, name }));
      }
    } catch {
      if (!disposed) useGameStore.getState().set({ connected: false });
    } finally {
      inFlight = false;
      if (!disposed)
        timer = setTimeout(() => void tick(), info?.pollInterval || 10000);
    }
  }
  const wake = () => {
    if (!document.hidden) void tick();
  };
  window.addEventListener("online", wake);
  window.addEventListener("flappy:refresh", wake);
  document.addEventListener("visibilitychange", wake);
  void tick();
  return () => {
    disposed = true;
    source?.close();
    clearTimeout(timer);
    window.removeEventListener("online", wake);
    window.removeEventListener("flappy:refresh", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
