import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BrandHeader } from "#/components/layout/brand-header.tsx";
import { Button } from "#/components/ui/button.tsx";
import { FormField } from "#/components/ui/form-field.tsx";
import { Label } from "#/components/ui/label.tsx";

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
		<div className="relative min-h-[100dvh] flex flex-col overflow-hidden">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-2 p-6 opacity-[0.04]"
			>
				{Array.from({ length: 30 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: decorative
					<div key={i} className="rounded-md border border-foreground" />
				))}
			</div>
			<BrandHeader />
			<main className="relative flex-1 flex items-center justify-center px-4 pb-8">
				<form
					onSubmit={onSubmit}
					className="w-full max-w-sm border rounded-2xl p-7 space-y-5 bg-card glow-primary"
				>
					<div className="space-y-1.5 text-center">
						<h1 className="text-2xl font-bold font-heading">Join a game</h1>
						<p className="text-sm text-muted-foreground">
							Enter the room code your host shared.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label
							htmlFor="code"
							className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
						>
							Room code
						</Label>
						<input
							id="code"
							ref={codeInputRef}
							required
							minLength={6}
							maxLength={6}
							value={code}
							onChange={(e) => setCode(e.target.value.toUpperCase())}
							inputMode="text"
							className="w-full rounded-lg border border-border bg-input px-3 py-3 room-code text-xl text-center text-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
							autoCapitalize="characters"
						/>
					</div>
					<FormField
						id="name"
						label="Display name"
						required
						minLength={1}
						maxLength={32}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<Button
						type="submit"
						className="w-full"
						size="lg"
						disabled={submitting || !code || !name}
					>
						{submitting ? "Joining…" : "Join game"}
					</Button>
				</form>
			</main>
		</div>
	);
}
