import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Load env from the repo root so a single .env is the source of truth
// for all workspaces. Safe to call repeatedly; values from process.env
// already set (e.g. by docker / Railway) take precedence.
const rootEnv = resolve(import.meta.dir, '../../../.env')
if (existsSync(rootEnv)) loadEnv({ path: rootEnv })

function required(name: string): string {
  const v = process.env[name]
  if (!v || v.length === 0) throw new Error(`Missing required env var: ${name}`)
  return v
}

function optional(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length > 0 ? v : undefined
}

function oneOf<T extends string>(name: string, choices: readonly T[]): T {
  const v = required(name)
  if (!(choices as readonly string[]).includes(v)) {
    throw new Error(`Env var ${name} must be one of ${choices.join(', ')}, got: ${v}`)
  }
  return v as T
}

export const env = {
  databaseUrl: required('DATABASE_URL'),

  betterAuthSecret: required('BETTER_AUTH_SECRET'),
  betterAuthUrl: required('BETTER_AUTH_URL'),

  webOrigin: required('WEB_ORIGIN'),

  mailer: oneOf('MAILER', ['smtp', 'resend'] as const),
  smtp: {
    host: optional('SMTP_HOST'),
    port: optional('SMTP_PORT'),
    user: optional('SMTP_USER'),
    pass: optional('SMTP_PASS'),
  },
  emailFrom: required('EMAIL_FROM'),
  resendApiKey: optional('RESEND_API_KEY'),
} as const
