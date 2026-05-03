import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { useAuth } from "#/stores/auth.ts";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/_unauth/register")({
	component: RegisterPage,
});

function RegisterPage() {
	const navigate = useNavigate();
	const refresh = useAuth((s) => s.refresh);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const res = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password, name }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as {
					message?: string;
				} | null;
				setError(body?.message ?? "Could not create your account.");
				return;
			}
			await refresh();
			navigate({ to: "/me" });
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<h1 className="text-2xl font-bold font-heading font-heading">
				Create an account
			</h1>
			<div className="space-y-2">
				<label className="text-sm" htmlFor="name">
					Display name
				</label>
				<input
					id="name"
					required
					minLength={1}
					maxLength={32}
					className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
			</div>
			<div className="space-y-2">
				<label className="text-sm" htmlFor="email">
					Email
				</label>
				<input
					id="email"
					type="email"
					required
					autoComplete="email"
					className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
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
					minLength={8}
					autoComplete="new-password"
					className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<p className="text-xs text-muted-foreground">At least 12 characters.</p>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<Button type="submit" className="w-full" disabled={loading}>
				{loading ? "Creating…" : "Create account"}
			</Button>
			<p className="text-sm text-center">
				Already have an account?{" "}
				<Link to="/login" className="underline">
					Log in
				</Link>
			</p>
		</form>
	);
}
