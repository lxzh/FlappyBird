import { getTursoConfig, getLeaderboardTimezone } from "../server/config.ts";

try {
  getTursoConfig();
} catch (error) {
  console.error(
    `Vercel 部署配置错误：${error.message} 请检查项目 Environment Variables 后重新部署。`,
  );
  process.exit(1);
}
try {
  getLeaderboardTimezone();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log("Vercel 必要配置检查通过（未输出任何凭据）。");
