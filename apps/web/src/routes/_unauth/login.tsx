import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { FormField } from "#/components/ui/form-field.tsx";
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
		<form onSubmit={onSubmit} className="space-y-5">
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold font-heading">Welcome back</h1>
				<p className="text-sm text-muted-foreground">
					Log in to host games and manage your quizzes.
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
			<FormField
				label="Password"
				type="password"
				required
				autoComplete="current-password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<Button type="submit" className="w-full" size="lg" disabled={loading}>
				{loading ? "Logging in…" : "Log in"}
			</Button>
			<div className="flex justify-between text-sm">
				<Link
					to="/forgot"
					className="text-muted-foreground hover:text-foreground transition-colors"
				>
					Forgot password?
				</Link>
				<Link to="/register" className="text-primary-bright hover:underline">
					Create account
				</Link>
			</div>
		</form>
	);
}
