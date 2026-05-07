import { createFileRoute, Link } from "@tanstack/react-router";
import QRCode from "qrcode";
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import type { ClientToServer, GameView } from "server/src/game/protocol.ts";
import { useStore } from "zustand";
import { Button } from "#/components/ui/button.tsx";
import { apiUrl } from "#/lib/api.ts";
import { useGameSocket } from "#/lib/game-socket.ts";

export const Route = createFileRoute("/host/$roomCode")({
	component: HostPage,
});

const PHASE_LABEL: Record<string, string> = {
	lobby: "Lobby",
	picking: "Picking",
	reading: "Reading",
	buzz_open: "Buzzers open",
	buzzed: "Answering",
	dd_wagering: "Daily Double",
	fj_wager: "Final · Wagers",
	fj_answer: "Final · Answers",
	fj_judging: "Final · Judging",
	completed: "Completed",
};

function HostPage() {
	const { roomCode } = Route.useParams();
	const { store, status, endReason, send } = useGameSocket(roomCode);
	const game = useStore(store, (s) => s.game);
	const ddPending = useStore(store, (s) => s.ddPending);
	const fjEligible = useStore(store, (s) => s.fjEligible);

	if (status === "ended") {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4 text-center">
				<p className="text-lg font-medium">This game is no longer available.</p>
				<p className="text-sm text-muted-foreground">
					{endReason ?? "It has ended or been replaced."}
				</p>
				<Link
					to="/"
					className="text-sm underline text-muted-foreground hover:text-foreground"
				>
					Back home
				</Link>
			</div>
		);
	}

	if (status !== "open" || !game) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
				<div className="size-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
				<p>{status === "closed" ? "Reconnecting…" : "Connecting…"}</p>
			</div>
		);
	}

	const buzzed = game.currentPlayerId
		? game.players.find((p) => p.id === game.currentPlayerId)
		: null;
	const nonHost = game.players
		.filter((p) => !p.isHost)
		.sort(
			(a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName),
		);
	const allClosed = game.board.every((c) => c.questions.every((q) => q.closed));
	const fjAvailable =
		game.phase === "picking" &&
		allClosed &&
		game.finalJeopardy !== null &&
		nonHost.some((p) => p.score > 0);

	const totalQuestions = game.board.reduce(
		(sum, cat) => sum + cat.questions.length,
		0,
	);
	const closedQuestions = game.board.reduce(
		(sum, cat) => sum + cat.questions.filter((q) => q.closed).length,
		0,
	);
	const progress = totalQuestions > 0 ? closedQuestions / totalQuestions : 0;
	const showBoard =
		game.phase === "picking" ||
		game.phase === "reading" ||
		game.phase === "buzz_open" ||
		game.phase === "buzzed" ||
		game.phase === "dd_wagering";

	return (
		<div className="min-h-[100dvh] p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
			<header className="relative overflow-hidden rounded-2xl border bg-card/80 backdrop-blur-sm p-5 sm:p-6">
				<div
					aria-hidden
					className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/10 blur-3xl"
				/>
				<div className="relative flex flex-wrap items-center gap-x-6 gap-y-4 justify-between">
					<div className="flex items-center gap-5">
						<Link
							to="/"
							className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
						>
							← Home
						</Link>
						<div>
							<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
								Room
							</p>
							<p className="room-code text-3xl sm:text-4xl wordmark-accent leading-tight">
								{game.roomCode}
							</p>
						</div>
						<div className="hidden sm:block h-10 w-px bg-border" />
						<div>
							<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
								Phase
							</p>
							<PhaseBadge phase={game.phase} />
						</div>
						{showBoard && (
							<div className="hidden md:block">
								<p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
									Board
								</p>
								<div className="flex items-center gap-2">
									<div className="h-1.5 w-32 rounded-full bg-input overflow-hidden">
										<div
											className="h-full bg-primary transition-all duration-500"
											style={{ width: `${progress * 100}%` }}
										/>
									</div>
									<span className="text-xs font-mono text-muted-foreground tabular-nums">
										{closedQuestions}/{totalQuestions}
									</span>
								</div>
							</div>
						)}
					</div>
					<div className="flex items-center gap-2">
						{game.phase === "lobby" && (
							<>
								<LobbyShareButton roomCode={game.roomCode} />
								<LobbySettingsButton game={game} send={send} />
								<Button size="lg" onClick={() => send({ type: "start_game" })}>
									Start game
								</Button>
							</>
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
					</div>
				</div>
			</header>

			<section className="rounded-2xl border bg-card/80 backdrop-blur-sm p-4 sm:p-5">
				<div className="flex items-center gap-2 mb-3">
					<h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						Players
					</h2>
					<span className="text-[10px] tabular-nums text-muted-foreground bg-input rounded-full px-2 py-0.5">
						{nonHost.length}
					</span>
				</div>
				{nonHost.length === 0 ? (
					<p className="text-sm text-muted-foreground text-center py-6">
						Waiting for players to join with the room code above…
					</p>
				) : (
					<RankedPlayers
						players={nonHost}
						currentPlayerId={game.currentPlayerId}
						currentPickerId={game.currentPickerId}
						manualPoints={game.manualPoints}
						onAdjust={(playerId, delta) =>
							send({ type: "adjust_score", playerId, delta })
						}
					/>
				)}
			</section>

			{showBoard && (
				<section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
					{game.board.map((cat) => (
						<div key={cat.ref} className="space-y-2 sm:space-y-3">
							<div className="text-center font-heading font-bold text-[11px] sm:text-sm py-3 sm:py-4 px-2 border rounded-lg bg-gradient-to-b from-primary/15 to-card uppercase tracking-wider leading-tight min-h-[3.25rem] flex items-center justify-center">
								{cat.title}
							</div>
							{cat.questions.map((q) => (
								<button
									key={q.ref}
									type="button"
									disabled={
										(q.closed && !game.allowReopen) || game.phase !== "picking"
									}
									onClick={() => {
										send({ type: "select_question", questionRef: q.ref });
										send({ type: "open_question" });
									}}
									className={`group w-full rounded-lg border py-4 sm:py-5 font-mono font-bold text-lg sm:text-2xl bg-gradient-to-br from-card to-input transition-all ${
										q.closed && !game.allowReopen
											? "opacity-15 line-through text-muted-foreground"
											: q.closed
												? "opacity-40 text-muted-foreground hover:opacity-70 hover:bg-muted/30 hover:scale-[1.02] active:scale-100"
												: "score hover:bg-primary hover:text-primary-foreground hover:from-primary hover:to-primary hover:border-primary hover:shadow-[0_0_24px_var(--primary-glow)] hover:scale-[1.02] active:scale-100"
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
				<section className="relative overflow-hidden border rounded-2xl p-6 bg-card text-center space-y-3 ring-1 ring-[color:var(--gold)]/40 shadow-[0_0_40px_var(--gold-dim)]">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[color:var(--gold)]/5 via-transparent to-[color:var(--gold)]/10"
					/>
					<p className="relative text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--gold)]">
						✦ Daily Double ✦
					</p>
					<p className="relative text-xl">
						Waiting for{" "}
						<strong className="text-foreground">
							{game.players.find((p) => p.id === ddPending.pickerId)
								?.displayName ?? "picker"}
						</strong>{" "}
						to wager…
					</p>
					<p className="relative text-sm text-muted-foreground font-mono">
						Range: <span className="score">${ddPending.min}</span> –{" "}
						<span className="score">${ddPending.max}</span>
					</p>
				</section>
			)}

			{(game.phase === "reading" ||
				game.phase === "buzz_open" ||
				game.phase === "buzzed") &&
				game.currentQuestion && (
					<QuestionModal
						key={game.currentQuestion.ref}
						clue={game.currentQuestion.clue}
						answer={game.currentQuestion.answer}
						pointValue={game.currentQuestion.pointValue}
						isDailyDouble={game.currentQuestion.isDailyDouble}
						media={game.currentQuestion.media ?? []}
						answerMedia={game.currentQuestion.answerMedia ?? []}
						youtubeId={game.currentQuestion.youtubeId ?? null}
						answerYoutubeId={game.currentQuestion.answerYoutubeId ?? null}
						hostNotes={game.currentQuestion.hostNotes ?? null}
						currentWager={game.currentWager}
						buzzedName={buzzed?.displayName ?? null}
						buzzQueue={game.buzzQueue ?? []}
						players={game.players}
						phase={game.phase}
						onJudge={(verdict) => send({ type: "judge", verdict })}
						onNextPlayer={() => send({ type: "next_player" })}
						onClose={() => send({ type: "close_question" })}
					/>
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

			{game.phase === "completed" && <CompletedView game={game} />}
		</div>
	);
}

function PhaseBadge({ phase }: { phase: string }) {
	const isFinal = phase.startsWith("fj_");
	const isLive =
		phase === "buzz_open" || phase === "buzzed" || phase === "reading";
	const dotClass = isFinal
		? "bg-[color:var(--gold)] shadow-[0_0_8px_var(--gold)]"
		: isLive
			? "bg-[color:var(--primary-bright)] shadow-[0_0_8px_var(--primary-glow)] animate-pulse"
			: "bg-muted-foreground/60";
	return (
		<span className="inline-flex items-center gap-2 text-sm font-medium">
			<span className={`size-2 rounded-full ${dotClass}`} />
			{PHASE_LABEL[phase] ?? phase}
		</span>
	);
}

type PlayerLite = import("server/src/game/protocol.ts").PlayerView;

function RankedPlayers({
	players,
	currentPlayerId,
	currentPickerId,
	manualPoints,
	onAdjust,
}: {
	players: PlayerLite[];
	currentPlayerId: string | null;
	currentPickerId: string | null;
	manualPoints: boolean;
	onAdjust: (playerId: string, delta: number) => void;
}) {
	const itemRefs = useRef(new Map<string, HTMLLIElement>());
	const prevRects = useRef(new Map<string, DOMRect>());
	const prevRanks = useRef(new Map<string, number>());
	const [rankedUp, setRankedUp] = useState<Set<string>>(new Set());

	// FLIP: after each render, compare new positions with the ones we cached
	// last render. If a card moved, instantly translate it back to its old
	// spot, then clear the transform on the next frame so CSS animates it
	// into the new position. Same trick used by every "list reorder" lib.
	useLayoutEffect(() => {
		const justRankedUp = new Set<string>();
		const newRects = new Map<string, DOMRect>();
		players.forEach((p, idx) => {
			const el = itemRefs.current.get(p.id);
			if (!el) return;
			const newRect = el.getBoundingClientRect();
			newRects.set(p.id, newRect);
			const oldRect = prevRects.current.get(p.id);
			if (oldRect) {
				const dx = oldRect.left - newRect.left;
				const dy = oldRect.top - newRect.top;
				if (dx !== 0 || dy !== 0) {
					el.style.transition = "none";
					el.style.transform = `translate(${dx}px, ${dy}px)`;
					// Force a reflow so the browser registers the start position
					// before we kick off the transition back to (0, 0).
					void el.getBoundingClientRect();
					requestAnimationFrame(() => {
						el.style.transition = "transform 360ms cubic-bezier(.2,.8,.2,1)";
						el.style.transform = "";
					});
				}
			}
			const oldRank = prevRanks.current.get(p.id);
			if (oldRank !== undefined && idx < oldRank) justRankedUp.add(p.id);
			prevRanks.current.set(p.id, idx);
		});
		prevRects.current = newRects;

		if (justRankedUp.size > 0) {
			setRankedUp(justRankedUp);
			const handle = setTimeout(() => setRankedUp(new Set()), 1200);
			return () => clearTimeout(handle);
		}
	}, [players]);

	return (
		<ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
			{players.map((p, idx) => {
				const isLeader = idx === 0 && p.score > 0;
				const isBuzzed = p.id === currentPlayerId;
				const isPicker = p.id === currentPickerId;
				const just = rankedUp.has(p.id);
				return (
					<li
						key={p.id}
						ref={(el) => {
							if (el) itemRefs.current.set(p.id, el);
							else itemRefs.current.delete(p.id);
						}}
						className={`relative rounded-xl border px-3 py-2.5 bg-input/60 will-change-transform transition-[border-color,box-shadow,background-color] ${
							isBuzzed
								? "border-primary glow-primary bg-primary/10"
								: isLeader
									? "border-[color:var(--gold)]/50"
									: ""
						} ${
							isPicker ? "ring-2 ring-[color:var(--gold)]/50" : ""
						} ${just ? "rank-up" : ""}`}
					>
						{isPicker && (
							<span className="absolute -top-2 left-2 inline-flex items-center gap-1 rounded-full bg-[color:var(--gold)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-background">
								Selecting
							</span>
						)}
						<div className="flex items-baseline gap-1.5 mb-1">
							<span
								className={`text-[10px] font-bold tabular-nums ${
									isLeader
										? "text-[color:var(--gold)]"
										: "text-muted-foreground"
								}`}
							>
								{isLeader ? "🏆" : `#${idx + 1}`}
							</span>
							<span className="block truncate text-sm font-medium">
								{p.displayName}
							</span>
						</div>
						<div className="score text-sm sm:text-base tabular-nums">
							{p.score < 0 ? (
								<span className="text-destructive">-${Math.abs(p.score)}</span>
							) : (
								<>${p.score}</>
							)}
						</div>
						{manualPoints && !p.isHost && (
							<ScoreAdjuster playerId={p.id} onAdjust={onAdjust} />
						)}
					</li>
				);
			})}
		</ul>
	);
}

function ScoreAdjuster({
	playerId,
	onAdjust,
}: {
	playerId: string;
	onAdjust: (playerId: string, delta: number) => void;
}) {
	return (
		<div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-white/5">
			<button
				type="button"
				onClick={() => onAdjust(playerId, 100)}
				className="flex-1 rounded-lg py-1 text-xs font-bold bg-green-500/10 text-green-400 hover:bg-green-500/20 active:scale-95 transition-all"
			>
				+100
			</button>
			<button
				type="button"
				onClick={() => onAdjust(playerId, -100)}
				className="flex-1 rounded-lg py-1 text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-95 transition-all"
			>
				−100
			</button>
		</div>
	);
}

function QuestionModal({
	clue,
	answer,
	pointValue,
	isDailyDouble,
	media,
	answerMedia,
	youtubeId,
	answerYoutubeId,
	hostNotes,
	currentWager,
	buzzedName,
	buzzQueue,
	players,
	phase,
	onJudge,
	onNextPlayer,
	onClose,
}: {
	clue: string;
	answer: string;
	pointValue: number;
	isDailyDouble: boolean;
	media: { id: string; mime: string; url: string }[];
	answerMedia: { id: string; mime: string; url: string }[];
	youtubeId: string | null;
	answerYoutubeId: string | null;
	hostNotes: string | null;
	currentWager: number | null;
	buzzedName: string | null;
	buzzQueue: string[];
	players: PlayerLite[];
	phase: string;
	onJudge: (verdict: "correct" | "incorrect" | "no_answer") => void;
	onNextPlayer: () => void;
	onClose: () => void;
}) {
	const [revealed, setRevealed] = useState(false);
	const isBuzzOpen = phase === "buzz_open";

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Current question"
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md animate-in fade-in duration-200"
		>
			<div
				className={`relative w-full max-w-3xl max-h-[90dvh] overflow-y-auto border rounded-2xl bg-gradient-to-br from-card to-card/60 ${
					isDailyDouble
						? "ring-2 ring-[color:var(--gold)]/50 shadow-[0_0_60px_var(--gold-dim)]"
						: "glow-primary"
				}`}
			>
				{/* decorative top stripe */}
				<div
					className={`h-1 w-full ${
						isDailyDouble
							? "bg-gradient-to-r from-transparent via-[color:var(--gold)] to-transparent"
							: "bg-gradient-to-r from-transparent via-[color:var(--primary-bright)] to-transparent"
					}`}
				/>

				<div className="p-6 sm:p-10 space-y-6">
					<div className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						{isDailyDouble ? (
							<span className="text-[color:var(--gold)] flex items-center gap-2">
								✦ Daily Double · Wager{" "}
								<span className="score text-base">${currentWager ?? "—"}</span>{" "}
								✦
							</span>
						) : (
							<span className="score text-lg">
								${currentWager ?? pointValue}
							</span>
						)}
					</div>

					<p className="text-2xl sm:text-4xl leading-snug text-center font-heading font-medium text-balance break-words [overflow-wrap:anywhere]">
						{clue}
					</p>

					{media.length > 0 && (
						<div className="flex flex-wrap justify-center gap-3">
							{media.map((m) => (
								<img
									key={m.id}
									src={apiUrl(m.url)}
									alt=""
									className="max-h-72 rounded-md border"
								/>
							))}
						</div>
					)}

					{youtubeId && (
						<div className="flex justify-center">
							<iframe
								src={`https://www.youtube.com/embed/${youtubeId}`}
								className="w-full max-w-2xl aspect-video rounded-md border"
								allow="autoplay; encrypted-media"
								allowFullScreen
								title="Question video"
							/>
						</div>
					)}

					{hostNotes && (
						<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
							<p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80 mb-1">
								Host notes
							</p>
							<p className="text-sm text-amber-200/90 whitespace-pre-wrap">
								{hostNotes}
							</p>
						</div>
					)}

					<div className="border-t border-border/60 pt-5 space-y-3">
						<p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground text-center">
							Answer
						</p>
						{revealed ? (
							<>
								<p className="text-xl sm:text-2xl text-center font-medium text-[color:var(--gold)] animate-in fade-in slide-in-from-bottom-1 duration-300 break-words [overflow-wrap:anywhere]">
									{answer}
								</p>
								{answerMedia.length > 0 && (
									<div className="flex flex-wrap justify-center gap-3">
										{answerMedia.map((m) => (
											<img
												key={m.id}
												src={apiUrl(m.url)}
												alt=""
												className="max-h-48 rounded-md border"
											/>
										))}
									</div>
								)}
								{answerYoutubeId && (
									<div className="flex justify-center">
										<iframe
											src={`https://www.youtube.com/embed/${answerYoutubeId}`}
											className="w-full max-w-xl aspect-video rounded-md border"
											allow="autoplay; encrypted-media"
											allowFullScreen
											title="Answer video"
										/>
									</div>
								)}
							</>
						) : (
							<div className="flex justify-center">
								<Button
									variant="outline"
									size="sm"
									onClick={() => setRevealed(true)}
								>
									Reveal answer
								</Button>
							</div>
						)}
					</div>

					{buzzedName ? (
						<div className="space-y-3 border-t border-border/60 pt-5">
							<p className="text-center text-base">
								<strong className="text-[color:var(--primary-bright)]">
									{buzzedName}
								</strong>{" "}
								<span className="text-muted-foreground">
									{currentWager !== null ? "is answering." : "buzzed in."}
								</span>
							</p>
							<div className="flex gap-2 flex-wrap justify-center">
								<Button onClick={() => onJudge("correct")}>✓ Correct</Button>
								<Button variant="outline" onClick={() => onJudge("incorrect")}>
									✗ Incorrect
								</Button>
								<Button variant="outline" onClick={() => onJudge("no_answer")}>
									No answer
								</Button>
								<NextPlayerButton
									buzzQueue={buzzQueue}
									players={players}
									onNextPlayer={onNextPlayer}
								/>
							</div>
						</div>
					) : (
						<div className="flex flex-col items-center gap-3 border-t border-border/60 pt-5">
							{isBuzzOpen && (
								<p className="text-xs text-muted-foreground flex items-center gap-2">
									<span className="size-2 rounded-full bg-[color:var(--primary-bright)] animate-pulse" />
									Buzzers open — waiting for a player
								</p>
							)}
							<Button variant="outline" onClick={onClose}>
								Close question
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function NextPlayerButton({
	buzzQueue,
	players,
	onNextPlayer,
}: {
	buzzQueue: string[];
	players: PlayerLite[];
	onNextPlayer: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const hasQueue = buzzQueue.length > 0;
	const nameOf = (id: string) =>
		players.find((p) => p.id === id)?.displayName ?? id;

	return (
		<div className="relative inline-block">
			<Button
				variant="outline"
				disabled={!hasQueue}
				onClick={onNextPlayer}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
			>
				Next player
			</Button>
			{hovered && (
				<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 min-w-[10rem] rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg pointer-events-none">
					{hasQueue ? (
						<ol className="space-y-1">
							{buzzQueue.map((id, i) => (
								<li key={id} className="flex items-center gap-2">
									<span className="text-muted-foreground tabular-nums w-4">
										{i + 1}.
									</span>
									<span className="font-medium">{nameOf(id)}</span>
								</li>
							))}
						</ol>
					) : (
						<p className="text-muted-foreground">No one buzzed yet</p>
					)}
				</div>
			)}
		</div>
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
		<section className="relative overflow-hidden border rounded-2xl p-6 bg-card ring-1 ring-[color:var(--gold)]/40 shadow-[0_0_40px_var(--gold-dim)] space-y-4">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[color:var(--gold)]/5 via-transparent to-transparent"
			/>
			<div className="relative space-y-1">
				<p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[color:var(--gold)]">
					✦ Final Jeopardy ✦
				</p>
				<p className="text-2xl font-heading font-bold">{fj.category}</p>
			</div>

			{game.phase === "fj_wager" && (
				<div className="relative">
					<p className="text-sm text-muted-foreground mb-3">
						Waiting for wagers…
					</p>
					<ul className="space-y-1.5">
						{eligiblePlayers.map((p) => {
							const ready = fj.wagersSubmitted.includes(p.id);
							return (
								<li
									key={p.id}
									className="flex items-center justify-between rounded-md bg-input/60 px-3 py-2 text-sm"
								>
									<span className="font-medium">{p.displayName}</span>
									<span
										className={
											ready
												? "text-[color:var(--gold)] font-medium"
												: "text-muted-foreground"
										}
									>
										{ready ? "✓ Ready" : "○ Waiting"}
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			{game.phase === "fj_answer" && (
				<div className="relative space-y-3">
					{fj.clue && (
						<p className="text-lg font-heading leading-snug">{fj.clue}</p>
					)}
					<ul className="space-y-1.5">
						{eligiblePlayers.map((p) => {
							const ready = fj.answersSubmitted.includes(p.id);
							return (
								<li
									key={p.id}
									className="flex items-center justify-between rounded-md bg-input/60 px-3 py-2 text-sm"
								>
									<span className="font-medium">{p.displayName}</span>
									<span
										className={
											ready
												? "text-[color:var(--gold)] font-medium"
												: "text-muted-foreground"
										}
									>
										{ready ? "✓ Answered" : "✎ Writing"}
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			{game.phase === "fj_judging" && (
				<div className="relative space-y-4">
					{fj.clue && (
						<p className="text-base text-muted-foreground italic border-l-2 border-[color:var(--gold)]/40 pl-3">
							{fj.clue}
						</p>
					)}
					{fj.answer && (
						<p className="text-sm">
							<span className="text-muted-foreground">Correct answer: </span>
							<span className="font-medium text-[color:var(--gold)]">
								{fj.answer}
							</span>
						</p>
					)}
					<ul className="space-y-3">
						{fj.results.map((r) => (
							<li
								key={r.playerId}
								className="border rounded-xl p-4 bg-input/60 space-y-2.5"
							>
								<div className="flex items-baseline justify-between text-sm">
									<strong className="text-base">{nameOf(r.playerId)}</strong>
									<span className="score">wager ${r.wager}</span>
								</div>
								<p className="text-sm">
									<span className="text-muted-foreground">Answer: </span>
									{r.answer ? (
										<span className="font-medium">{r.answer}</span>
									) : (
										<em className="text-muted-foreground">(empty)</em>
									)}
								</p>
								{r.verdict ? (
									<p className="text-xs text-muted-foreground">
										Judged:{" "}
										<strong
											className={
												r.verdict === "correct"
													? "text-[color:var(--gold)]"
													: "text-foreground"
											}
										>
											{r.verdict}
										</strong>
									</p>
								) : (
									<div className="flex gap-2 flex-wrap pt-1">
										<Button
											size="sm"
											onClick={() => onJudge(r.playerId, "correct")}
										>
											✓ Correct
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => onJudge(r.playerId, "incorrect")}
										>
											✗ Incorrect
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

function CompletedView({
	game,
}: {
	game: import("server/src/game/protocol.ts").GameView;
}) {
	const ranked = [...game.players]
		.filter((p) => !p.isHost)
		.sort((a, b) => b.score - a.score);
	const winner = ranked[0];

	return (
		<section className="relative overflow-hidden border rounded-2xl p-8 sm:p-10 text-center bg-card glow-primary space-y-6">
			<div
				aria-hidden
				className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 size-96 rounded-full bg-primary/15 blur-3xl"
			/>
			<div className="relative space-y-2">
				<p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
					Game complete
				</p>
				<h2 className="text-4xl sm:text-5xl font-heading font-black wordmark-accent">
					{winner ? `${winner.displayName} wins!` : "Game over"}
				</h2>
				{winner && <p className="score text-2xl">${winner.score}</p>}
			</div>
			<ol className="relative space-y-1.5 max-w-md mx-auto text-left">
				{ranked.map((p, i) => {
					const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
					return (
						<li
							key={p.id}
							className={`flex items-center justify-between rounded-lg px-4 py-3 ${
								i === 0
									? "bg-[color:var(--gold)]/10 border border-[color:var(--gold)]/30"
									: "bg-input/60"
							}`}
						>
							<span className="flex items-center gap-3">
								<span className="text-muted-foreground tabular-nums w-6 text-sm">
									{medal ?? `${i + 1}.`}
								</span>
								<span className="font-medium">{p.displayName}</span>
							</span>
							<span className="score">${p.score}</span>
						</li>
					);
				})}
			</ol>
			<div className="relative">
				<Link
					to="/games/$roomCode/result"
					params={{ roomCode: game.roomCode }}
					className="inline-flex items-center gap-2 text-sm text-[color:var(--primary-bright)] hover:underline"
				>
					Shareable results page
					<span aria-hidden>→</span>
				</Link>
			</div>
		</section>
	);
}

function LobbyShareButton({ roomCode }: { roomCode: string }) {
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

	const url =
		typeof window !== "undefined"
			? `${window.location.origin}/join?code=${roomCode}`
			: `/join?code=${roomCode}`;

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		void QRCode.toDataURL(url, {
			margin: 1,
			width: 320,
			color: { dark: "#0a0613ff", light: "#f6f3ffff" },
		}).then((d) => {
			if (!cancelled) setQrDataUrl(d);
		});
		return () => {
			cancelled = true;
		};
	}, [open, url]);

	function copyLink() {
		void navigator.clipboard.writeText(url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	function close() {
		setOpen(false);
		setCopied(false);
	}

	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				Share lobby
			</Button>
			{open &&
				createPortal(
					<>
						<button
							type="button"
							aria-label="Close dialog"
							className="fixed inset-0 z-20 bg-background/90 backdrop-blur"
							onClick={close}
						/>
						<div
							role="dialog"
							aria-modal="true"
							aria-label="Share lobby"
							className="fixed inset-0 z-20 overflow-y-auto pointer-events-none"
						>
							<div className="flex min-h-full items-center justify-center p-4">
								<div className="relative bg-card border rounded-2xl p-6 w-full max-w-sm space-y-5 glow-primary pointer-events-auto text-center">
									<div className="space-y-1">
										<h2 className="font-heading font-bold text-lg">
											Share lobby
										</h2>
										<p className="text-xs uppercase tracking-wider text-muted-foreground">
											Room code
										</p>
										<p className="room-code text-2xl wordmark-accent">
											{roomCode}
										</p>
									</div>

									<div className="mx-auto rounded-xl bg-[oklch(0.96_0.005_290)] p-3 w-fit">
										{qrDataUrl ? (
											<img
												src={qrDataUrl}
												alt={`QR code for joining room ${roomCode}`}
												width={240}
												height={240}
												className="block size-60"
											/>
										) : (
											<div className="size-60 grid place-items-center text-xs text-muted-foreground">
												Generating…
											</div>
										)}
									</div>

									<div className="space-y-2">
										<p className="text-xs uppercase tracking-wider text-muted-foreground">
											Join link
										</p>
										<p className="text-sm break-all rounded-lg border border-border bg-input px-3 py-2 text-foreground/90">
											{url}
										</p>
										<div className="flex gap-2">
											<Button
												variant="outline"
												className="flex-1"
												onClick={copyLink}
											>
												{copied ? "Copied!" : "Copy link"}
											</Button>
											<Button variant="ghost" onClick={close}>
												Close
											</Button>
										</div>
									</div>
								</div>
							</div>
						</div>
					</>,
					document.body,
				)}
		</>
	);
}

function LobbySettingsButton({
	game,
	send,
}: {
	game: GameView;
	send: (msg: ClientToServer) => void;
}) {
	const [open, setOpen] = useState(false);
	const manualId = useId();
	const finalId = useId();
	const reopenId = useId();
	const delayId = useId();

	const [local, setLocal] = useState({
		manualPoints: game.manualPoints,
		finalEnabled: game.finalEnabled,
		allowReopen: game.allowReopen,
		readDelayMs: game.readDelayMs,
	});

	const close = useCallback(() => {
		send({ type: "update_settings", ...local });
		setOpen(false);
	}, [local, send]);

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") close();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, close]);

	useEffect(() => {
		if (!open) {
			setLocal({
				manualPoints: game.manualPoints,
				finalEnabled: game.finalEnabled,
				allowReopen: game.allowReopen,
				readDelayMs: game.readDelayMs,
			});
		}
	}, [
		game.manualPoints,
		game.finalEnabled,
		game.allowReopen,
		game.readDelayMs,
		open,
	]);

	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				Settings
			</Button>
			{open &&
				createPortal(
					<>
						<button
							type="button"
							aria-label="Close dialog"
							className="fixed inset-0 z-20 bg-background/90 backdrop-blur"
							onClick={close}
						/>
						<div
							role="dialog"
							aria-modal="true"
							aria-label="Game settings"
							className="fixed inset-0 z-20 overflow-y-auto pointer-events-none"
						>
							<div className="flex min-h-full items-center justify-center p-4">
								<div className="relative bg-card border rounded-2xl p-5 w-full max-w-sm space-y-4 glow-primary pointer-events-auto">
									<h2 className="font-heading font-bold text-lg">
										Game settings
									</h2>

									<label
										htmlFor={manualId}
										className="flex items-center gap-3 text-sm cursor-pointer"
									>
										<input
											id={manualId}
											type="checkbox"
											checked={local.manualPoints}
											onChange={(e) =>
												setLocal({ ...local, manualPoints: e.target.checked })
											}
											className="size-4"
										/>
										<span>
											<span className="block font-medium">
												Manual point assignment
											</span>
											<span className="block text-xs text-muted-foreground">
												Disable automatic scoring. Host assigns points manually
												during gameplay.
											</span>
										</span>
									</label>

									<label
										htmlFor={finalId}
										className="flex items-center gap-3 text-sm cursor-pointer"
									>
										<input
											id={finalId}
											type="checkbox"
											checked={local.finalEnabled}
											onChange={(e) =>
												setLocal({ ...local, finalEnabled: e.target.checked })
											}
											className="size-4"
										/>
										<span>
											<span className="block font-medium">Final Jeopardy</span>
											<span className="block text-xs text-muted-foreground">
												Play a final round after the board is cleared.
											</span>
										</span>
									</label>

									<label
										htmlFor={reopenId}
										className="flex items-center gap-3 text-sm cursor-pointer"
									>
										<input
											id={reopenId}
											type="checkbox"
											checked={local.allowReopen}
											onChange={(e) =>
												setLocal({ ...local, allowReopen: e.target.checked })
											}
											className="size-4"
										/>
										<span>
											<span className="block font-medium">
												Allow revisiting answered questions
											</span>
											<span className="block text-xs text-muted-foreground">
												Answered questions stay gray but remain clickable.
											</span>
										</span>
									</label>

									<div className="space-y-1">
										<label
											htmlFor={delayId}
											className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
										>
											Read delay (ms)
										</label>
										<input
											id={delayId}
											type="number"
											min={0}
											max={10000}
											step={500}
											value={local.readDelayMs}
											onChange={(e) =>
												setLocal({
													...local,
													readDelayMs: Number(e.target.value),
												})
											}
											className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
										/>
										<p className="text-xs text-muted-foreground">
											Time before buzzers open after the host opens a question.
										</p>
									</div>

									<div className="flex justify-end">
										<Button onClick={close}>Done</Button>
									</div>
								</div>
							</div>
						</div>
					</>,
					document.body,
				)}
		</>
	);
}
