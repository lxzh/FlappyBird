const missing = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"].filter(
  (key) => !process.env[key]?.trim(),
);
if (missing.length) {
  console.error(
    `Vercel 部署缺少环境变量：${missing.join(", ")}。请在 Vercel 项目 Settings → Environment Variables 中配置，或连接 Turso Marketplace 数据库后重新部署。`,
  );
  process.exit(1);
}
try {
  const url = new URL(process.env.TURSO_DATABASE_URL);
  if (!url.hostname || !["libsql:", "https:"].includes(url.protocol))
    throw new Error();
} catch {
  console.error(
    "TURSO_DATABASE_URL 必须是有效的 libsql:// 或 https:// 云数据库地址。",
  );
  process.exit(1);
}
try {
  new Intl.DateTimeFormat("en", {
    timeZone: process.env.TZ || "Asia/Shanghai",
  }).format();
} catch {
  console.error("TZ 不是有效时区，请使用 Asia/Shanghai 等 IANA 时区。");
  process.exit(1);
}
console.log("Vercel 必要配置检查通过（未输出任何凭据）。");
