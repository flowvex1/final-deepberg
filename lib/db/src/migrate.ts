import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

try {
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("Database migrations complete");
} finally {
  await pool.end();
}
