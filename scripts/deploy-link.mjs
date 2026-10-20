import { execFileSync } from "node:child_process";
let repository = process.argv[2];
if (!repository) {
  try {
    repository = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {}
}
repository = repository
  ?.replace(/^git@github.com:/, "https://github.com/")
  .replace(/\.git$/, "");
if (
  !repository ||
  !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository)
) {
  console.error(
    "请提供真实 GitHub 仓库：npm run deploy:link -- https://github.com/你的用户名/你的仓库",
  );
  process.exit(1);
}
const params = new URLSearchParams({
  "repository-url": repository,
  env: "TURSO_DATABASE_URL,TURSO_AUTH_TOKEN",
  envDescription:
    "先创建 Turso libSQL 数据库，填写连接 URL 和读写 Token。凭据只用于服务端。",
  envLink: repository,
  "project-name": "flappy-bird",
  "repository-name": "flappy-bird",
});
console.log(
  `[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?${params})`,
);
