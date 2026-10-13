import { execFileSync } from "node:child_process";
const database = "radar_sprint2_acceptance_" + Date.now();
execFileSync(
  "docker",
  ["compose", "exec", "-T", "db", "createdb", "-U", "radar", database],
  { stdio: "inherit" },
);
const url = new URL(process.env.DATABASE_URL);
url.pathname = "/" + database;
const env = { ...process.env, DATABASE_URL: url.href };
for (const args of [
  ["migrate", "deploy"],
  ["migrate", "status"],
  [
    "migrate",
    "diff",
    "--from-schema-datasource",
    "prisma/schema.prisma",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--exit-code",
  ],
]) {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { env, stdio: "inherit" },
  );
}
console.log(
  "PASS: clean database migrations and drift check. Acceptance database preserved: " +
    database,
);
