import { createFileRoute, Link } from "@tanstack/react-router";
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
	const ddPending = useStore(store, (s) => s.ddPending);
	const fjEligible = useStore(store, (s) => s.fjEligible);

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
	const picker = game.currentPickerId
		? game.players.find((p) => p.id === game.currentPickerId)
		: null;
	const nonHost = game.players.filter((p) => !p.isHost);
	const allClosed = game.board.every((c) => c.questions.every((q) => q.closed));
	const fjAvailable =
		game.phase === "picking" &&
		allClosed &&
		game.finalJeopardy !== null &&
		nonHost.some((p) => p.score > 0);

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
				{fjAvailable && (
					<Button
						size="lg"
						variant="gold"
						onClick={() => send({ type: "start_final" })}
					>
						Start Final Jeopardy
					</Button>
				)}
			</header>

			<section className="border rounded-2xl p-3 bg-card">
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Players
					</h2>
					{game.phase === "picking" && nonHost.length > 0 && (
						<PickerOverride
							players={nonHost}
							currentId={game.currentPickerId}
							onPick={(id) => send({ type: "set_picker", playerId: id })}
						/>
					)}
				</div>
				<ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
					{nonHost.map((p) => (
						<li
							key={p.id}
							className={`rounded-md border px-2 py-1 bg-input transition-colors ${
								p.id === game.currentPlayerId
									? "border-primary glow-primary"
									: ""
							} ${p.id === game.currentPickerId ? "ring-2 ring-[color:var(--gold)]/50" : ""}`}
						>
							<span className="block truncate">
								{p.displayName}
								{p.id === game.currentPickerId && (
									<span className="ml-1 text-[color:var(--gold)]">★</span>
								)}
							</span>
							<span className="score text-xs">${p.score}</span>
						</li>
					))}
				</ul>
				{picker && game.phase === "picking" && (
					<p className="mt-2 text-xs text-muted-foreground">
						Picking:{" "}
						<strong className="text-foreground">{picker.displayName}</strong>
					</p>
				)}
			</section>

			{(game.phase === "picking" ||
				game.phase === "reading" ||
				game.phase === "buzz_open" ||
				game.phase === "buzzed" ||
				game.phase === "dd_wagering") && (
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
			)}

			{game.phase === "dd_wagering" && ddPending && (
				<section className="border rounded-2xl p-5 bg-card glow-primary text-center space-y-2">
					<p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--gold)]">
						Daily Double
					</p>
					<p className="text-lg">
						Waiting for{" "}
						<strong>
							{game.players.find((p) => p.id === ddPending.pickerId)
								?.displayName ?? "picker"}
						</strong>{" "}
						to wager…
					</p>
					<p className="text-sm text-muted-foreground">
						Range: ${ddPending.min} – ${ddPending.max}
					</p>
				</section>
			)}

			{(game.phase === "reading" ||
				game.phase === "buzz_open" ||
				game.phase === "buzzed") &&
				game.currentQuestion && (
					<section className="border rounded-2xl p-5 space-y-3 bg-card glow-primary">
						<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							<span className="score">
								${game.currentWager ?? game.currentQuestion.pointValue}
							</span>
							{game.currentQuestion.isDailyDouble && (
								<span className="ml-2 text-[color:var(--gold)]">
									· Daily Double (wager ${game.currentWager ?? "—"})
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
									<strong>{buzzed.displayName}</strong>{" "}
									{game.currentWager !== null ? "is answering." : "buzzed in."}
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

			{(game.phase === "fj_wager" ||
				game.phase === "fj_answer" ||
				game.phase === "fj_judging") &&
				game.finalJeopardy && (
					<FinalSection
						game={game}
						eligible={fjEligible}
						onJudge={(playerId, verdict) =>
							send({ type: "fj_judge", playerId, verdict })
						}
					/>
				)}

			{game.phase === "completed" && (
				<section className="border rounded-2xl p-6 text-center space-y-4 bg-card glow-primary">
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
					<Link
						to="/games/$roomCode/result"
						params={{ roomCode: game.roomCode }}
						className="inline-block text-sm underline text-[color:var(--primary-bright)]"
					>
						Shareable results page →
					</Link>
				</section>
			)}
		</div>
	);
}

function PickerOverride({
	players,
	currentId,
	onPick,
}: {
	players: { id: string; displayName: string }[];
	currentId: string | null;
	onPick: (id: string) => void;
}) {
	return (
		<select
			aria-label="Set picker"
			value={currentId ?? ""}
			onChange={(e) => {
				const v = e.target.value;
				if (v) onPick(v);
			}}
			className="text-xs bg-input border rounded-md px-2 py-1 focus:outline-none focus:border-primary"
		>
			<option value="" disabled>
				Set picker…
			</option>
			{players.map((p) => (
				<option key={p.id} value={p.id}>
					{p.displayName}
				</option>
			))}
		</select>
	);
}

function FinalSection({
	game,
	eligible,
	onJudge,
}: {
	game: import("server/src/game/protocol.ts").GameView;
	eligible: string[];
	onJudge: (
		playerId: string,
		verdict: "correct" | "incorrect" | "no_answer",
	) => void;
}) {
	const fj = game.finalJeopardy;
	if (!fj) return null;
	const eligiblePlayers = game.players.filter((p) => eligible.includes(p.id));
	const nameOf = (id: string) =>
		game.players.find((p) => p.id === id)?.displayName ?? id;

	return (
		<section className="border rounded-2xl p-5 bg-card glow-primary space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--gold)]">
				Final Jeopardy
			</p>
			<p className="text-lg font-heading font-bold">{fj.category}</p>

			{game.phase === "fj_wager" && (
				<div>
					<p className="text-sm">Waiting for wagers…</p>
					<ul className="text-sm mt-2 space-y-1">
						{eligiblePlayers.map((p) => (
							<li key={p.id} className="flex justify-between">
								<span>{p.displayName}</span>
								<span
									className={
										fj.wagersSubmitted.includes(p.id)
											? "text-[color:var(--gold)]"
											: "text-muted-foreground"
									}
								>
									{fj.wagersSubmitted.includes(p.id) ? "ready ✓" : "waiting"}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{game.phase === "fj_answer" && (
				<div>
					{fj.clue && <p className="text-base leading-snug">{fj.clue}</p>}
					<ul className="text-sm mt-3 space-y-1">
						{eligiblePlayers.map((p) => (
							<li key={p.id} className="flex justify-between">
								<span>{p.displayName}</span>
								<span
									className={
										fj.answersSubmitted.includes(p.id)
											? "text-[color:var(--gold)]"
											: "text-muted-foreground"
									}
								>
									{fj.answersSubmitted.includes(p.id)
										? "answered ✓"
										: "writing"}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{game.phase === "fj_judging" && (
				<div className="space-y-3">
					{fj.clue && (
						<p className="text-sm text-muted-foreground italic">{fj.clue}</p>
					)}
					{fj.answer && (
						<p className="text-sm">
							<span className="text-muted-foreground">Correct: </span>
							<span className="font-medium">{fj.answer}</span>
						</p>
					)}
					<ul className="space-y-3">
						{fj.results.map((r) => (
							<li
								key={r.playerId}
								className="border rounded-md p-3 bg-input space-y-2"
							>
								<div className="flex justify-between text-sm">
									<strong>{nameOf(r.playerId)}</strong>
									<span className="score">wager ${r.wager}</span>
								</div>
								<p className="text-sm">
									<span className="text-muted-foreground">Answer: </span>
									{r.answer || <em className="text-muted-foreground">empty</em>}
								</p>
								{r.verdict ? (
									<p className="text-xs text-muted-foreground">
										Judged: <strong>{r.verdict}</strong>
									</p>
								) : (
									<div className="flex gap-2 flex-wrap">
										<Button
											size="sm"
											onClick={() => onJudge(r.playerId, "correct")}
										>
											Correct
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => onJudge(r.playerId, "incorrect")}
										>
											Incorrect
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => onJudge(r.playerId, "no_answer")}
										>
											No answer
										</Button>
									</div>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
