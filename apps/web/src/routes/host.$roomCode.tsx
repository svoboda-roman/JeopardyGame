import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "zustand";
import { Button } from "#/components/ui/button.tsx";
import { useGameSocket } from "#/lib/game-socket.ts";

export const Route = createFileRoute("/host/$roomCode")({
	component: HostPage,
});

function HostPage() {
	const { roomCode } = Route.useParams();
	const { store, status, send } = useGameSocket(roomCode);
	const game = useStore(store, (s) => s.game);

	if (status !== "open" || !game) {
		return (
			<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
				{status === "closed" ? "Reconnecting…" : "Connecting…"}
			</div>
		);
	}

	const buzzed = game.currentPlayerId
		? game.players.find((p) => p.id === game.currentPlayerId)
		: null;

	return (
		<div className="min-h-[100dvh] p-4 max-w-6xl mx-auto space-y-4">
			<header className="flex flex-wrap items-center gap-4 justify-between">
				<div>
					<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Room
					</p>
					<p className="room-code text-3xl wordmark-accent">{game.roomCode}</p>
				</div>
				<p className="text-sm text-muted-foreground">
					Phase: <span className="text-foreground font-mono">{game.phase}</span>
				</p>
				{game.phase === "lobby" && (
					<Button size="lg" onClick={() => send({ type: "start_game" })}>
						Start game
					</Button>
				)}
			</header>

			<section className="border rounded-2xl p-3 bg-card">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
					Players
				</h2>
				<ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
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
								<span className="block truncate">{p.displayName}</span>
								<span className="score text-xs">${p.score}</span>
							</li>
						))}
				</ul>
			</section>

			<section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
				{game.board.map((cat) => (
					<div key={cat.ref} className="space-y-2">
						<div className="text-center font-heading font-bold text-xs sm:text-sm py-3 border rounded-md bg-card uppercase tracking-wide">
							{cat.title}
						</div>
						{cat.questions.map((q) => (
							<button
								key={q.ref}
								type="button"
								disabled={q.closed || game.phase !== "picking"}
								onClick={() => {
									send({ type: "select_question", questionRef: q.ref });
									send({ type: "open_question" });
								}}
								className={`w-full rounded-md border py-4 font-mono font-bold text-lg bg-card transition-all ${
									q.closed
										? "opacity-20 line-through text-muted-foreground"
										: "score hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-[0_0_18px_var(--primary-glow)]"
								} disabled:cursor-not-allowed`}
							>
								${q.pointValue}
							</button>
						))}
					</div>
				))}
			</section>

			{(game.phase === "reading" ||
				game.phase === "buzz_open" ||
				game.phase === "buzzed") &&
				game.currentQuestion && (
					<section className="border rounded-2xl p-5 space-y-3 bg-card glow-primary">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							<span className="score">${game.currentQuestion.pointValue}</span>
							{game.currentQuestion.isDailyDouble && (
								<span className="ml-2 text-[color:var(--gold)]">
									· Daily Double
								</span>
							)}
						</p>
						<p className="text-xl leading-snug">{game.currentQuestion.clue}</p>
						<p className="text-sm">
							<span className="text-muted-foreground">Answer: </span>
							<span className="font-medium">{game.currentQuestion.answer}</span>
						</p>
						{buzzed ? (
							<div className="space-y-2">
								<p className="text-sm">
									<strong>{buzzed.displayName}</strong> buzzed in.
								</p>
								<div className="flex gap-2 flex-wrap">
									<Button
										onClick={() => send({ type: "judge", verdict: "correct" })}
									>
										Correct
									</Button>
									<Button
										variant="outline"
										onClick={() =>
											send({ type: "judge", verdict: "incorrect" })
										}
									>
										Incorrect
									</Button>
									<Button
										variant="outline"
										onClick={() =>
											send({ type: "judge", verdict: "no_answer" })
										}
									>
										No answer
									</Button>
								</div>
							</div>
						) : (
							<Button
								variant="outline"
								onClick={() => send({ type: "close_question" })}
							>
								Close question
							</Button>
						)}
					</section>
				)}

			{game.phase === "completed" && (
				<section className="border rounded-2xl p-6 text-center space-y-3 bg-card glow-primary">
					<h2 className="text-3xl font-heading font-bold">Game complete</h2>
					<ol className="space-y-1 max-w-sm mx-auto">
						{[...game.players]
							.filter((p) => !p.isHost)
							.sort((a, b) => b.score - a.score)
							.map((p, i) => (
								<li
									key={p.id}
									className="flex justify-between border-b border-border py-2"
								>
									<span>
										<span className="text-muted-foreground mr-2">{i + 1}.</span>
										{p.displayName}
									</span>
									<span className="score">${p.score}</span>
								</li>
							))}
					</ol>
				</section>
			)}
		</div>
	);
}
