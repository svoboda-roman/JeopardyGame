import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load env from the repo root (single .env across the workspace)
loadEnv({ path: '../../.env' })

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required to run drizzle-kit')

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
