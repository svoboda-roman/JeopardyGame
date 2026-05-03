import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client.ts";
import { env } from "./env.ts";
import { mailer } from "./mailer/index.ts";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg" }),
	secret: env.betterAuthSecret,
	baseURL: env.betterAuthUrl,

	trustedOrigins: [env.webOrigin],

	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false, // Verification is enforced on host actions, not login (FR-A2)
		minPasswordLength: 8,
		sendResetPassword: async ({ user, token }) => {
			const link = `${env.webOrigin}/reset?token=${encodeURIComponent(token)}`;
			await mailer.send({
				to: user.email,
				subject: "Reset your JeopardyGame password",
				text: `Reset your password: ${link}`,
				html: `<p>Reset your password by clicking the link below:</p><p><a href="${link}">${link}</a></p>`,
			});
		},
	},

	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, token }) => {
			const link = `${env.webOrigin}/verify?token=${encodeURIComponent(token)}`;
			await mailer.send({
				to: user.email,
				subject: "Verify your JeopardyGame email",
				text: `Verify your email: ${link}`,
				html: `<p>Welcome to JeopardyGame! Verify your email by clicking the link below:</p><p><a href="${link}">${link}</a></p>`,
			});
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days (FR-A5)
		updateAge: 60 * 60 * 24, // refresh expiry once per day
	},

	advanced: {
		defaultCookieAttributes: {
			httpOnly: true,
			sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
			secure: process.env.NODE_ENV === "production",
		},
	},
});

export type Auth = typeof auth;
