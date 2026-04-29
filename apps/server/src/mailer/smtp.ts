import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../env.ts'
import type { Mailer, SendArgs } from './index.ts'

export class SmtpMailer implements Mailer {
  private transporter: Transporter

  constructor() {
    if (!env.smtp.host || !env.smtp.port) {
      throw new Error('SMTP_HOST and SMTP_PORT are required when MAILER=smtp')
    }
    this.transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: Number(env.smtp.port),
      secure: false,
      auth:
        env.smtp.user && env.smtp.pass
          ? { user: env.smtp.user, pass: env.smtp.pass }
          : undefined,
    })
  }

  async send({ to, subject, html, text }: SendArgs): Promise<void> {
    await this.transporter.sendMail({
      from: env.emailFrom,
      to,
      subject,
      html,
      text,
    })
  }
}
