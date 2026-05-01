import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";

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
			<div className="space-y-3">
				<h1 className="text-2xl font-bold">Check your email</h1>
				<p className="text-sm text-muted-foreground">
					If an account exists for that address, we've sent a reset link.
				</p>
				<Link to="/login" className="text-sm underline">
					Back to log in
				</Link>
			</div>
		);
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<h1 className="text-2xl font-bold">Reset password</h1>
			<div className="space-y-2">
				<label className="text-sm" htmlFor="email">
					Email
				</label>
				<input
					id="email"
					type="email"
					required
					className="w-full rounded-md border bg-background px-3 py-2"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<Button type="submit" className="w-full" disabled={loading}>
				{loading ? "Sending…" : "Send reset link"}
			</Button>
			<Link to="/login" className="text-sm underline block text-center">
				Back to log in
			</Link>
		</form>
	);
}
