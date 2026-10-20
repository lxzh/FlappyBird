// The host's TZ may be a POSIX value (e.g. :UTC), not an IANA identifier.
// Ranking dates use their own explicit setting, identical at build and runtime.
export function getLeaderboardTimezone(env: NodeJS.ProcessEnv = process.env) {
  const timezone = env.LEADERBOARD_TIMEZONE?.trim() || "Asia/Shanghai";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new Error(
      "LEADERBOARD_TIMEZONE 不是有效时区，请使用 Asia/Shanghai 等 IANA 时区。",
    );
  }
  return timezone;
}

// Resolve credentials as a pair: never combine two databases' URLs and tokens.
export function getTursoConfig(env: NodeJS.ProcessEnv = process.env) {
  const pairs = [
    ["FLAPPY_BIRD_TURSO_DATABASE_URL", "FLAPPY_BIRD_TURSO_AUTH_TOKEN"],
    ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"],
  ] as const;

  for (const [urlKey, tokenKey] of pairs) {
    const url = env[urlKey]?.trim();
    const authToken = env[tokenKey]?.trim();
    if (!url && !authToken) continue;
    if (!url || !authToken)
      throw new Error(
        `数据库环境变量不完整：请同时配置 ${urlKey} 和 ${tokenKey}。`,
      );

    try {
      const parsed = new URL(url);
      if (!parsed.hostname || !["libsql:", "https:"].includes(parsed.protocol))
        throw new Error();
    } catch {
      throw new Error(
        `${urlKey} 必须是有效的 libsql:// 或 https:// 云数据库地址。`,
      );
    }
    return { url, authToken };
  }

  throw new Error(
    "请配置 FLAPPY_BIRD_TURSO_DATABASE_URL 和 FLAPPY_BIRD_TURSO_AUTH_TOKEN；也兼容整组 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN。",
  );
}
