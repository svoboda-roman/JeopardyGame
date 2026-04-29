import { env } from '../env.ts'
import { ResendMailer } from './resend.ts'
import { SmtpMailer } from './smtp.ts'

export interface SendArgs {
  to: string
  subject: string
  html: string
  text: string
}

export interface Mailer {
  send(args: SendArgs): Promise<void>
}

function createMailer(): Mailer {
  if (env.mailer === 'resend') return new ResendMailer()
  return new SmtpMailer()
}

export const mailer = createMailer()
