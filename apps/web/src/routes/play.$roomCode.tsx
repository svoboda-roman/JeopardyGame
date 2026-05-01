import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "zustand";
import { useGameSocket } from "#/lib/game-socket.ts";

export const Route = createFileRoute("/play/$roomCode")({
	component: PlayPage,
});

function PlayPage() {
	const { roomCode } = Route.useParams();
	const { store, status, send } = useGameSocket(roomCode);
	const game = useStore(store, (s) => s.game);
	const selfId = useStore(store, (s) => s.selfPlayerId);
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

	const canBuzz = game.phase === "buzz_open" || game.phase === "reading";

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
								}`}
							>
								<span className="block font-medium truncate">
									{p.displayName}
								</span>
								<span className="score text-xs">${p.score}</span>
							</li>
						))}
				</ul>
			</section>

			{(game.phase === "reading" ||
				game.phase === "buzz_open" ||
				game.phase === "buzzed") &&
				game.currentQuestion && (
					<section className="border rounded-2xl p-4 space-y-2 bg-card">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							<span className="score">${game.currentQuestion.pointValue}</span>
							{game.currentQuestion.isDailyDouble && " · Daily Double"}
						</p>
						<p className="text-lg leading-snug">{game.currentQuestion.clue}</p>
						{buzzedPlayer && (
							<p className="text-sm text-muted-foreground">
								<strong className="text-foreground">
									{buzzedPlayer.displayName}
								</strong>{" "}
								buzzed in.
							</p>
						)}
					</section>
				)}

			{game.phase === "lobby" && (
				<p className="text-center text-sm text-muted-foreground">
					Waiting for the host to start…
				</p>
			)}
			{game.phase === "picking" && (
				<p className="text-center text-sm text-muted-foreground">
					Host is picking the next question…
				</p>
			)}
			{game.phase === "completed" && (
				<p className="text-center text-base font-medium">Game over.</p>
			)}

			<div className="flex-1" />

			<button
				type="button"
				aria-label="Buzz"
				onClick={() => send({ type: "buzz" })}
				disabled={!canBuzz}
				className="buzz w-full rounded-3xl font-heading font-bold text-3xl tracking-wider py-14"
			>
				BUZZ
			</button>

			{lastError && (
				<p className="text-center text-xs text-destructive">
					{lastError.message}
				</p>
			)}
		</div>
	);
}
