import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { FormField } from "#/components/ui/form-field.tsx";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/_unauth/reset")({
	validateSearch: (s: Record<string, unknown>): { token?: string } =>
		typeof s.token === "string" ? { token: s.token } : {},
	component: ResetPage,
});

function ResetPage() {
	const { token } = Route.useSearch();
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!token) {
			setError("Missing reset token. Use the link from your email.");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			const res = await fetch(`${apiUrl}/api/auth/reset-password`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newPassword: password, token }),
			});
			if (!res.ok) {
				setError("Reset link is invalid or expired.");
				return;
			}
			navigate({ to: "/login" });
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-5">
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold font-heading">Set a new password</h1>
				<p className="text-sm text-muted-foreground">
					Pick something you'll remember — at least 12 characters.
				</p>
			</div>
			<FormField
				label="New password"
				type="password"
				required
				minLength={8}
				autoComplete="new-password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				error={error}
			/>
			<Button
				type="submit"
				className="w-full"
				size="lg"
				disabled={loading || !token}
			>
				{loading ? "Updating…" : "Update password"}
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
