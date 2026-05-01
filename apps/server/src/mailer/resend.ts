import { Resend } from "resend";
import { env } from "../env.ts";
import type { Mailer, SendArgs } from "./index.ts";

export class ResendMailer implements Mailer {
	private client: Resend;

	constructor() {
		if (!env.resendApiKey) {
			throw new Error("RESEND_API_KEY is required when MAILER=resend");
		}
		this.client = new Resend(env.resendApiKey);
	}

	async send({ to, subject, html, text }: SendArgs): Promise<void> {
		const { error } = await this.client.emails.send({
			from: env.emailFrom,
			to,
			subject,
			html,
			text,
		});
		if (error) throw new Error(`Resend send failed: ${error.message}`);
	}
}
