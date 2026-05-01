import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";

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
		<form onSubmit={onSubmit} className="space-y-4">
			<h1 className="text-2xl font-bold font-heading font-heading">
				Set a new password
			</h1>
			<div className="space-y-2">
				<label className="text-sm" htmlFor="password">
					New password
				</label>
				<input
					id="password"
					type="password"
					required
					minLength={12}
					autoComplete="new-password"
					className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<Button type="submit" className="w-full" disabled={loading || !token}>
				{loading ? "Updating…" : "Update password"}
			</Button>
			<Link to="/login" className="text-sm underline block text-center">
				Back to log in
			</Link>
		</form>
	);
}
