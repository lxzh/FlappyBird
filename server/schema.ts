import { getLeaderboardTimezone } from "./config.ts";

// Shared SQLite/libSQL schema and ranking query: one source for both deployments.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, seed INTEGER NOT NULL, started_at INTEGER NOT NULL, score INTEGER, ticks INTEGER, finished_at INTEGER, FOREIGN KEY(player_id) REFERENCES players(id));
CREATE INDEX IF NOT EXISTS runs_player ON runs(player_id, finished_at);
CREATE INDEX IF NOT EXISTS runs_finished ON runs(finished_at);
CREATE TABLE IF NOT EXISTS presence (player_id TEXT PRIMARY KEY, last_seen INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS presence_seen ON presence(last_seen);
CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS limits_expires ON request_limits(expires_at);
`;
export const BOARD_SQL = `WITH eligible AS (
  SELECT * FROM runs WHERE finished_at>=? AND score IS NOT NULL
), best AS (
  SELECT player_id, MAX(score) AS score, COUNT(*) AS games, MAX(finished_at) AS lastPlayed FROM eligible GROUP BY player_id
) SELECT p.id, p.name, b.score, b.games, b.lastPlayed
FROM best b JOIN players p ON p.id=b.player_id JOIN eligible r ON r.player_id=b.player_id AND r.score=b.score
GROUP BY p.id ORDER BY b.score DESC, MIN(r.finished_at) ASC, p.id ASC LIMIT 100`;

// Explicit IANA timezone instead of relying on the serverless host's UTC clock.
export function dayStart(
  now = Date.now(),
  timezone = getLeaderboardTimezone(),
) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = date.split("-").map(Number);
  const midnight = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(midnight);
  const offset = parts.find((part) => part.type === "timeZoneName")!.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset);
  return (
    midnight -
    (match
      ? (match[1] === "+" ? 1 : -1) *
        (Number(match[2]) * 60 + Number(match[3])) *
        60000
      : 0)
  );
}
