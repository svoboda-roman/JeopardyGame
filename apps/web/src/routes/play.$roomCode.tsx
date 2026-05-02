import { createFileRoute, Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useStore } from "zustand";
import { WagerInput } from "#/components/game/wager-input.tsx";
import { Button } from "#/components/ui/button.tsx";
import { useGameSocket } from "#/lib/game-socket.ts";

export const Route = createFileRoute("/play/$roomCode")({
	component: PlayPage,
});

function PlayPage() {
	const { roomCode } = Route.useParams();
	const { store, status, send } = useGameSocket(roomCode);
	const game = useStore(store, (s) => s.game);
	const selfId = useStore(store, (s) => s.selfPlayerId);
	const ddPending = useStore(store, (s) => s.ddPending);
	const fjEligible = useStore(store, (s) => s.fjEligible);
	const lastError = useStore(store, (s) => s.lastError);

	if (status !== "open" || !game) {
		return (
			<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
				{status === "closed" ? "Reconnecting…" : "Connecting…"}
			</div>
		);
	}

	const me = game.players.find((p) => p.id === selfId);
	const buzzedPlayer = game.currentPlayerId
		? game.players.find((p) => p.id === game.currentPlayerId)
		: null;

	const isDDPicker =
		game.phase === "dd_wagering" &&
		ddPending !== null &&
		ddPending.pickerId === selfId;
	const isDDOther =
		game.phase === "dd_wagering" && !isDDPicker && ddPending !== null;

	const inFJ = selfId !== null && fjEligible.includes(selfId);
	const fjPhase =
		game.phase === "fj_wager" ||
		game.phase === "fj_answer" ||
		game.phase === "fj_judging";

	const canBuzz =
		(game.phase === "buzz_open" || game.phase === "reading") && !isDDOther;

	return (
		<div className="min-h-[100dvh] flex flex-col p-4 gap-4 max-w-md mx-auto w-full">
			<header className="flex items-center justify-between">
				<span className="text-xs uppercase tracking-wider text-muted-foreground">
					Room{" "}
					<span className="room-code text-foreground ml-1">
						{game.roomCode}
					</span>
				</span>
				<span className="text-sm">
					You: <strong>{me?.displayName ?? "—"}</strong>{" "}
					<span className="score ml-1">${me?.score ?? 0}</span>
				</span>
			</header>

			<section className="border rounded-2xl p-3 space-y-2 bg-card">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Players
				</h2>
				<ul className="grid grid-cols-2 gap-2 text-sm">
					{game.players
						.filter((p) => !p.isHost)
						.map((p) => (
							<li
								key={p.id}
								className={`rounded-md border px-2 py-1 bg-input transition-colors ${
									p.id === game.currentPlayerId
										? "border-primary glow-primary"
										: ""
								} ${p.id === game.currentPickerId ? "ring-2 ring-[color:var(--gold)]/50" : ""}`}
							>
								<span className="block font-medium truncate">
									{p.displayName}
									{p.id === game.currentPickerId && (
										<span className="ml-1 text-[color:var(--gold)]">★</span>
									)}
								</span>
								<span className="score text-xs">${p.score}</span>
							</li>
						))}
				</ul>
			</section>

			{isDDPicker && ddPending && (
				<section className="border rounded-2xl p-4 space-y-3 bg-card glow-primary">
					<p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--gold)]">
						Daily Double — your wager
					</p>
					<WagerInput
						min={ddPending.min}
						max={ddPending.max}
						label="How much?"
						submitLabel="Wager"
						onSubmit={(amount) => send({ type: "wager", amount })}
					/>
				</section>
			)}

			{isDDOther && (
				<section className="border rounded-2xl p-4 bg-card text-center">
					<p className="text-sm text-muted-foreground">
						Daily Double — only the picker plays this one.
					</p>
				</section>
			)}

			{(game.phase === "reading" ||
				game.phase === "buzz_open" ||
				game.phase === "buzzed") &&
				game.currentQuestion && (
					<section className="border rounded-2xl p-4 space-y-2 bg-card">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							<span className="score">
								${game.currentWager ?? game.currentQuestion.pointValue}
							</span>
							{game.currentQuestion.isDailyDouble &&
								` · Daily Double (wager $${game.currentWager ?? "—"})`}
						</p>
						<p className="text-lg leading-snug">{game.currentQuestion.clue}</p>
						{buzzedPlayer && (
							<p className="text-sm text-muted-foreground">
								<strong className="text-foreground">
									{buzzedPlayer.displayName}
								</strong>{" "}
								{game.currentWager !== null ? "is answering." : "buzzed in."}
							</p>
						)}
					</section>
				)}

			{fjPhase && game.finalJeopardy && (
				<FinalPlayer
					game={game}
					selfId={selfId}
					inFJ={inFJ}
					onWager={(amount) => send({ type: "fj_wager", amount })}
					onAnswer={(text) => send({ type: "fj_answer", text })}
				/>
			)}

			{game.phase === "lobby" && (
				<p className="text-center text-sm text-muted-foreground">
					Waiting for the host to start…
				</p>
			)}
			{game.phase === "picking" && (
				<p className="text-center text-sm text-muted-foreground">
					{game.currentPickerId === selfId
						? "Your turn — host will pick a question on the board."
						: "Host is picking the next question…"}
				</p>
			)}
			{game.phase === "completed" && (
				<div className="text-center space-y-2">
					<p className="text-base font-medium">Game over.</p>
					<Link
						to="/games/$roomCode/result"
						params={{ roomCode: game.roomCode }}
						className="inline-block text-sm underline text-[color:var(--primary-bright)]"
					>
						See results →
					</Link>
				</div>
			)}

			<div className="flex-1" />

			{!fjPhase && !isDDPicker && !isDDOther && (
				<button
					type="button"
					aria-label="Buzz"
					onClick={() => send({ type: "buzz" })}
					disabled={!canBuzz}
					className="buzz w-full rounded-3xl font-heading font-bold text-3xl tracking-wider py-14"
				>
					BUZZ
				</button>
			)}

			{lastError && (
				<p className="text-center text-xs text-destructive">
					{lastError.message}
				</p>
			)}
		</div>
	);
}

function FinalPlayer({
	game,
	selfId,
	inFJ,
	onWager,
	onAnswer,
}: {
	game: import("server/src/game/protocol.ts").GameView;
	selfId: string | null;
	inFJ: boolean;
	onWager: (amount: number) => void;
	onAnswer: (text: string) => void;
}) {
	const fj = game.finalJeopardy;
	if (!fj) return null;

	if (!inFJ) {
		return (
			<section className="border rounded-2xl p-4 bg-card text-center space-y-2">
				<p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--gold)]">
					Final Jeopardy
				</p>
				<p className="text-sm text-muted-foreground">
					You're sitting this one out (score ≤ 0).
				</p>
				<p className="text-sm font-heading">{fj.category}</p>
			</section>
		);
	}

	const me = game.players.find((p) => p.id === selfId);
	const myMax = me?.score ?? 0;

	return (
		<section className="border rounded-2xl p-4 bg-card glow-primary space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--gold)]">
				Final Jeopardy
			</p>
			<p className="text-base font-heading font-bold">{fj.category}</p>

			{game.phase === "fj_wager" &&
				selfId !== null &&
				(fj.wagersSubmitted.includes(selfId) ? (
					<p className="text-sm text-muted-foreground text-center">
						Wager locked in. Waiting for others…
					</p>
				) : (
					<WagerInput
						min={0}
						max={myMax}
						label="Your wager"
						submitLabel="Lock wager"
						onSubmit={onWager}
					/>
				))}

			{game.phase === "fj_answer" && selfId !== null && (
				<FJAnswerInput
					clue={fj.clue}
					alreadySubmitted={fj.answersSubmitted.includes(selfId)}
					onSubmit={onAnswer}
				/>
			)}

			{game.phase === "fj_judging" && (
				<p className="text-sm text-muted-foreground text-center">
					Host is judging…
				</p>
			)}
		</section>
	);
}

function FJAnswerInput({
	clue,
	alreadySubmitted,
	onSubmit,
}: {
	clue: string | null;
	alreadySubmitted: boolean;
	onSubmit: (text: string) => void;
}) {
	const [text, setText] = useState("");
	const [submitted, setSubmitted] = useState(alreadySubmitted);
	const inputId = useId();

	if (submitted || alreadySubmitted) {
		return (
			<p className="text-sm text-muted-foreground text-center">
				Answer submitted. Waiting for everyone else…
			</p>
		);
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (!text.trim()) return;
				setSubmitted(true);
				onSubmit(text.trim());
			}}
			className="space-y-2"
		>
			{clue && <p className="text-base leading-snug">{clue}</p>}
			<label
				htmlFor={inputId}
				className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
			>
				Your answer
			</label>
			<input
				id={inputId}
				value={text}
				onChange={(e) => setText(e.target.value)}
				maxLength={200}
				className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
			/>
			<Button type="submit" className="w-full" disabled={!text.trim()}>
				Submit answer
			</Button>
		</form>
	);
}
