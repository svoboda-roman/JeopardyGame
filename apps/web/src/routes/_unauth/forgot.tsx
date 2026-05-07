import { Mail01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { FormField } from "#/components/ui/form-field.tsx";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/_unauth/forgot")({
	component: ForgotPage,
});

function ForgotPage() {
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);
	const [loading, setLoading] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		try {
			await fetch(`${apiUrl}/api/auth/forget-password`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email,
					redirectTo: `${window.location.origin}/reset`,
				}),
			});
			setSent(true);
		} finally {
			setLoading(false);
		}
	}

	if (sent) {
		return (
			<div className="space-y-4 text-center">
				<div className="mx-auto grid place-items-center size-14 rounded-full bg-primary/10 text-primary-bright glow-primary">
					<HugeiconsIcon icon={Mail01Icon} size={28} aria-hidden />
				</div>
				<div className="space-y-1.5">
					<h1 className="text-2xl font-bold font-heading">Check your email</h1>
					<p className="text-sm text-muted-foreground">
						If an account exists for that address, we've sent a reset link.
					</p>
				</div>
				<Link
					to="/login"
					className="inline-block text-sm text-primary-bright hover:underline"
				>
					Back to log in
				</Link>
			</div>
		);
	}

	return (
		<form onSubmit={onSubmit} className="space-y-5">
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold font-heading">Reset password</h1>
				<p className="text-sm text-muted-foreground">
					We'll email you a secure link to set a new one.
				</p>
			</div>
			<FormField
				label="Email"
				type="email"
				required
				autoComplete="email"
				value={email}
				onChange={(e) => setEmail(e.target.value)}
			/>
			<Button type="submit" className="w-full" size="lg" disabled={loading}>
				{loading ? "Sending…" : "Send reset link"}
			</Button>
			<Link
				to="/login"
				className="block text-sm text-center text-muted-foreground hover:text-foreground transition-colors"
			>
				Back to log in
			</Link>
		</form>
	);
}
