import { getTursoConfig } from "../server/config.ts";

try {
  getTursoConfig();
} catch (error) {
  console.error(
    `Vercel 部署配置错误：${error.message} 请检查项目 Environment Variables 后重新部署。`,
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
