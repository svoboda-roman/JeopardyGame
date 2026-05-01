import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button.tsx";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/join")({
	validateSearch: (s: Record<string, unknown>): { code?: string } =>
		typeof s.code === "string" ? { code: s.code } : {},
	component: JoinPage,
});

function JoinPage() {
	const { code: initialCode } = Route.useSearch();
	const navigate = useNavigate();
	const [code, setCode] = useState(initialCode ?? "");
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const codeInputRef = useRef<HTMLInputElement>(null);

	// Manual focus on mount — equivalent UX to autoFocus but skipped
	// for keyboard users mid-navigation, friendlier for screen readers.
	useEffect(() => {
		codeInputRef.current?.focus();
	}, []);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const upper = code.toUpperCase().trim();
			const res = await fetch(`${apiUrl}/games/${upper}/join`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ displayName: name }),
			});
			if (res.status === 404) {
				setError("No game with that room code.");
				return;
			}
			if (res.status === 409) {
				const body = (await res.json().catch(() => null)) as {
					error?: { code?: string };
				} | null;
				setError(
					body?.error?.code === "full"
						? "Game is full."
						: "Game cannot be joined right now.",
				);
				return;
			}
			if (!res.ok) {
				setError("Could not join the game.");
				return;
			}
			navigate({ to: "/play/$roomCode", params: { roomCode: upper } });
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center px-4">
			<form
				onSubmit={onSubmit}
				className="w-full max-w-sm border rounded-2xl p-6 space-y-4 bg-card"
			>
				<h1 className="text-2xl font-bold text-center">Join a game</h1>
				<div className="space-y-2">
					<label className="text-sm" htmlFor="code">
						Room code
					</label>
					<input
						id="code"
						ref={codeInputRef}
						required
						minLength={6}
						maxLength={6}
						value={code}
						onChange={(e) => setCode(e.target.value.toUpperCase())}
						className="w-full rounded-md border bg-background px-3 py-2 uppercase text-center tracking-[0.4em] font-mono text-lg"
						autoCapitalize="characters"
					/>
				</div>
				<div className="space-y-2">
					<label className="text-sm" htmlFor="name">
						Display name
					</label>
					<input
						id="name"
						required
						minLength={1}
						maxLength={32}
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full rounded-md border bg-background px-3 py-2"
					/>
				</div>
				{error && <p className="text-sm text-destructive">{error}</p>}
				<Button
					type="submit"
					className="w-full"
					disabled={submitting || !code || !name}
				>
					{submitting ? "Joining…" : "Join game"}
				</Button>
			</form>
		</div>
	);
}
