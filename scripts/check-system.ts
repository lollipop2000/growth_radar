import { checkSystem } from "../src/lib/health";
import { db } from "../src/lib/db";
try {
  const rows = await checkSystem();
  console.log(JSON.stringify(rows, null, 2));
  if (rows.find((row) => row.type === "Database")?.status !== "Connected")
    process.exitCode = 1;
} finally {
  await db.$disconnect();
}
