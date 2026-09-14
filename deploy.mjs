import { execSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const config = require("./config.json");

const { user, server, remote_path } = config.deploy ?? {};

if (!server) {
  console.error('Deploy abortado: preencha "deploy.server" no config.json.');
  process.exit(1);
}

const dest = `${user}@${server}:${remote_path}`;
console.log(`Enviando dist/ → ${dest}`);
execSync(`scp -r dist/. ${dest}`, { stdio: "inherit" });
console.log(`Ajustando permissões → 755`);
execSync(`ssh ${user}@${server} "chmod -R 755 ${remote_path}"`, { stdio: "inherit" });

