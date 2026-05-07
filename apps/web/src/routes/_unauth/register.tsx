import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { FormField } from "#/components/ui/form-field.tsx";
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
		} catch {
			setError(`Could not reach the server at ${apiUrl}.`);
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-5">
			<div className="space-y-1.5 text-center">
				<h1 className="text-2xl font-bold font-heading">Create an account</h1>
				<p className="text-sm text-muted-foreground">
					Start authoring quizzes and hosting live games.
				</p>
			</div>
			<FormField
				label="Display name"
				required
				minLength={1}
				maxLength={32}
				value={name}
				onChange={(e) => setName(e.target.value)}
			/>
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
				minLength={8}
				autoComplete="new-password"
				helper="At least 8 characters."
				value={password}
				onChange={(e) => setPassword(e.target.value)}
			/>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<Button type="submit" className="w-full" size="lg" disabled={loading}>
				{loading ? "Creating…" : "Create account"}
			</Button>
			<p className="text-sm text-center text-muted-foreground">
				Already have an account?{" "}
				<Link to="/login" className="text-primary-bright hover:underline">
					Log in
				</Link>
			</p>
		</form>
	);
}
