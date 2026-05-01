import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env.ts";
import * as schema from "./schema.ts";

const pool = new Pool({ connectionString: env.databaseUrl });

export const db = drizzle(pool, { schema });
export type DB = typeof db;
