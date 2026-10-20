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
