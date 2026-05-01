import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { useAuth } from "#/stores/auth.ts";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/_unauth/login")({
	validateSearch: (s: Record<string, unknown>): { next?: string } =>
		typeof s.next === "string" ? { next: s.next } : {},
	component: LoginPage,
});

function LoginPage() {
	const { next } = Route.useSearch();
	const navigate = useNavigate();
	const refresh = useAuth((s) => s.refresh);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});
			if (!res.ok) {
				setError("Invalid email or password.");
				return;
			}
			await refresh();
			navigate({ to: next ?? "/me" });
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<h1 className="text-2xl font-bold">Log in</h1>
			<div className="space-y-2">
				<label className="text-sm" htmlFor="email">
					Email
				</label>
				<input
					id="email"
					type="email"
					required
					autoComplete="email"
					className="w-full rounded-md border bg-background px-3 py-2"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</div>
			<div className="space-y-2">
				<label className="text-sm" htmlFor="password">
					Password
				</label>
				<input
					id="password"
					type="password"
					required
					autoComplete="current-password"
					className="w-full rounded-md border bg-background px-3 py-2"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<Button type="submit" className="w-full" disabled={loading}>
				{loading ? "Logging in…" : "Log in"}
			</Button>
			<div className="flex justify-between text-sm">
				<Link to="/forgot" className="underline">
					Forgot password?
				</Link>
				<Link to="/register" className="underline">
					Register
				</Link>
			</div>
		</form>
	);
}
