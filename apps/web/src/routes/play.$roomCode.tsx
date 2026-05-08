import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { useStore } from "zustand";
import { DrinkShopButton } from "#/components/DrinkShop.tsx";
import { DrinkToast } from "#/components/DrinkToast.tsx";
import { WagerInput } from "#/components/game/wager-input.tsx";
import { PendingDrinkModal } from "#/components/PendingDrinkModal.tsx";
import { Button } from "#/components/ui/button.tsx";
import { apiUrl } from "#/lib/api.ts";
import { useGameSocket } from "#/lib/game-socket.ts";

type GameView = import("server/src/game/protocol.ts").GameView;
type PlayerView = import("server/src/game/protocol.ts").PlayerView;

export const Route = createFileRoute("/play/$roomCode")({
	component: PlayPage,
});

function PlayPage() {
	const { roomCode } = Route.useParams();
	const navigate = useNavigate();
	const { store, status, endReason, endCode, send } = useGameSocket(roomCode);
	const game = useStore(store, (s) => s.game);
	const selfId = useStore(store, (s) => s.selfPlayerId);
	const ddPending = useStore(store, (s) => s.ddPending);
	const fjEligible = useStore(store, (s) => s.fjEligible);
	const lastError = useStore(store, (s) => s.lastError);
	const lastDrink = useStore(store, (s) => s.lastDrink);
	const clearLastDrink = useStore(store, (s) => s.clearLastDrink);

	// If we land here from a shared /play/<code> link without ever having
	// joined this game, the WS rejects us with 4403. Bounce to the join
	// form with the code prefilled instead of showing "not available".
	useEffect(() => {
		if (status === "ended" && endCode === 4403) {
			navigate({ to: "/join", search: { code: roomCode } });
		}
	}, [status, endCode, navigate, roomCode]);

	// Track lockout for the current question across phase changes. The server
	// only emits the error event once on the early buzz; we hold onto it until
	// the question closes.
	const [lockedOnQuestion, setLockedOnQuestion] = useState<string | null>(null);
	useEffect(() => {
		if (lastError?.code === "early_buzz" && game?.currentQuestion) {
			setLockedOnQuestion(game.currentQuestion.ref);
		}
	}, [lastError, game?.currentQuestion]);
	useEffect(() => {
		if (
			!game?.currentQuestion ||
			(lockedOnQuestion && game.currentQuestion.ref !== lockedOnQuestion)
		) {
			setLockedOnQuestion(null);
		}
	}, [game?.currentQuestion, lockedOnQuestion]);

	if (status === "ended" && endCode === 4403) {
		return (
			<div className="min-h-[100dvh] flex items-center justify-center text-sm text-muted-foreground">
				Redirecting to join…
			</div>
		);
	}

	if (status === "ended") {
		return (
			<div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 p-4 text-center">
				<p className="text-lg font-medium">This game is no longer available.</p>
				<p className="text-sm text-muted-foreground">
					{endReason ?? "The host may have ended it or started a new one."}
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
			<div className="min-h-[100dvh] flex items-center justify-center text-sm text-muted-foreground">
				{status === "closed" ? "Reconnecting…" : "Connecting…"}
			</div>
		);
	}

	const me = game.players.find((p) => p.id === selfId) ?? null;
	const buzzedPlayer = game.currentPlayerId
		? (game.players.find((p) => p.id === game.currentPlayerId) ?? null)
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

	const lockedOut =
		lockedOnQuestion !== null && game.currentQuestion?.ref === lockedOnQuestion;

	const inQueue = (game.buzzQueue ?? []).includes(selfId ?? "");
	const isAnswering = game.currentPlayerId === selfId;
	const canBuzz =
		(game.phase === "buzz_open" || game.phase === "buzzed") &&
		!isDDOther &&
		!lockedOut &&
		!inQueue &&
		!isAnswering;

	const activeCategory = game.currentQuestion
		? (game.board.find((c) => c.ref === game.currentQuestion?.categoryRef)
				?.title ?? null)
		: null;

	return (
		<div className="min-h-[100dvh] flex flex-col gap-4 max-w-md mx-auto w-full px-4 pt-4 pb-6">
			<HeaderBar roomCode={game.roomCode} me={me} />

			<StatusBanner
				phase={game.phase}
				isPicker={game.currentPickerId === selfId}
				buzzedName={buzzedPlayer?.displayName ?? null}
				ddOther={isDDOther}
				lockedOut={lockedOut}
				inQueue={inQueue}
			/>

			<PlayersStrip
				players={game.players.filter((p) => !p.isHost)}
				selfId={selfId}
				currentPlayerId={game.currentPlayerId}
				currentPickerId={game.currentPickerId}
			/>

			{game.phase !== "lobby" && (game.drinks ?? []).length > 0 && (
				<div className="flex justify-end">
					<DrinkShopButton game={game} selfId={selfId} send={send} />
				</div>
			)}

			<PendingDrinkModal
				orders={(game.drinkOrders ?? []).filter(
					(o) => o.recipientId === selfId && o.acknowledgedAtMs === null,
				)}
				drinks={game.drinks ?? []}
				players={game.players}
			/>

			{lastDrink && (
				<DrinkToast
					order={lastDrink}
					drinks={game.drinks ?? []}
					players={game.players}
					selfId={selfId}
					onDismiss={clearLastDrink}
				/>
			)}

			{isDDPicker && ddPending && (
				<section className="border rounded-2xl p-4 space-y-3 bg-card glow-primary">
					<p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--gold)] text-center">
						Daily Double — your wager
					</p>
					<WagerInput
						min={ddPending.min}
						max={ddPending.max}
						step={100}
						label="How much?"
						submitLabel="Wager"
						onSubmit={(amount) => send({ type: "wager", amount })}
					/>
				</section>
			)}

			{(game.phase === "reading" ||
				game.phase === "buzz_open" ||
				game.phase === "buzzed") &&
				game.currentQuestion && (
					<ClueCard
						category={activeCategory}
						pointValue={game.currentQuestion.pointValue}
						isDailyDouble={game.currentQuestion.isDailyDouble}
						isShot={game.currentQuestion.isShot}
						currentWager={game.currentWager}
						clue={game.currentQuestion.clue}
						media={game.currentQuestion.media ?? []}
						youtubeId={game.currentQuestion.youtubeId ?? null}
					/>
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

			{game.phase === "completed" && (
				<section className="border rounded-2xl p-6 text-center space-y-3 bg-card glow-primary">
					<p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--gold)]">
						Game over
					</p>
					<p className="text-3xl font-heading font-bold">
						<span className="score">${me?.score ?? 0}</span>
					</p>
					<Link
						to="/games/$roomCode/result"
						params={{ roomCode: game.roomCode }}
						className="inline-block text-sm underline text-[color:var(--primary-bright)]"
					>
						See full results →
					</Link>
				</section>
			)}

			<div className="flex-1" />

			{!fjPhase && !isDDPicker && !isDDOther && game.phase !== "completed" && (
				<BuzzControl
					canBuzz={canBuzz}
					lockedOut={lockedOut}
					inQueue={inQueue}
					onBuzz={() => send({ type: "buzz" })}
				/>
			)}

			{lastError && lastError.code !== "early_buzz" && (
				<p className="text-center text-xs text-destructive">
					{lastError.message}
				</p>
			)}
		</div>
	);
}

function HeaderBar({
	roomCode,
	me,
}: {
	roomCode: string;
	me: PlayerView | null;
}) {
	const initials = me?.displayName
		? me.displayName
				.split(/\s+/)
				.map((s) => s[0])
				.filter(Boolean)
				.slice(0, 2)
				.join("")
				.toUpperCase()
		: "?";
	return (
		<header className="flex items-center justify-between gap-3">
			<div className="space-y-0.5">
				<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
					Room
				</p>
				<p className="room-code text-2xl text-foreground leading-none">
					{roomCode}
				</p>
			</div>
			<div className="flex items-center gap-2 rounded-full border bg-card pl-1 pr-3 py-1 glow-primary/0">
				<div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center text-sm font-bold font-heading">
					{initials}
				</div>
				<div className="flex flex-col items-end leading-tight">
					<span className="text-xs text-muted-foreground truncate max-w-[10ch]">
						{me?.displayName ?? "—"}
					</span>
					<span className="score text-base">${me?.score ?? 0}</span>
				</div>
			</div>
		</header>
	);
}

function StatusBanner({
	phase,
	isPicker,
	buzzedName,
	ddOther,
	lockedOut,
	inQueue,
}: {
	phase: GameView["phase"];
	isPicker: boolean;
	buzzedName: string | null;
	ddOther: boolean;
	lockedOut: boolean;
	inQueue: boolean;
}) {
	const { label, tone } = bannerContent({
		phase,
		isPicker,
		buzzedName,
		ddOther,
		lockedOut,
		inQueue,
	});

	const toneClasses =
		tone === "primary"
			? "border-primary/60 text-foreground glow-primary"
			: tone === "gold"
				? "border-[color:var(--gold)]/60 text-[color:var(--gold)]"
				: tone === "danger"
					? "border-destructive/60 text-destructive"
					: "border-border text-muted-foreground";

	return (
		<div
			className={`rounded-full border bg-card/60 backdrop-blur-sm px-4 py-2 text-center text-sm font-medium uppercase tracking-wider ${toneClasses}`}
		>
			{label}
		</div>
	);
}

function bannerContent({
	phase,
	isPicker,
	buzzedName,
	ddOther,
	lockedOut,
	inQueue,
}: {
	phase: GameView["phase"];
	isPicker: boolean;
	buzzedName: string | null;
	ddOther: boolean;
	lockedOut: boolean;
	inQueue: boolean;
}): { label: string; tone: "primary" | "gold" | "danger" | "muted" } {
	if (phase === "lobby")
		return { label: "Waiting for the host to start", tone: "muted" };
	if (phase === "picking")
		return isPicker
			? { label: "★ Your pick", tone: "gold" }
			: { label: "Picking next clue…", tone: "muted" };
	if (phase === "reading")
		return lockedOut
			? { label: "Buzzed too early — locked out", tone: "danger" }
			: { label: "Get ready…", tone: "muted" };
	if (phase === "buzz_open")
		return lockedOut
			? { label: "Locked out", tone: "danger" }
			: { label: "Buzz now!", tone: "primary" };
	if (phase === "buzzed")
		return inQueue
			? { label: "You're in the queue", tone: "primary" }
			: {
					label: buzzedName ? `${buzzedName} buzzed in` : "Buzzed in",
					tone: "muted",
				};
	if (phase === "dd_wagering")
		return ddOther
			? { label: "Daily Double — picker only", tone: "gold" }
			: { label: "Daily Double — your wager", tone: "gold" };
	if (phase === "fj_wager")
		return { label: "Final Jeopardy — wager", tone: "gold" };
	if (phase === "fj_answer")
		return { label: "Final Jeopardy — your answer", tone: "gold" };
	if (phase === "fj_judging")
		return { label: "Host is judging…", tone: "muted" };
	if (phase === "completed") return { label: "Game over", tone: "gold" };
	return { label: phase, tone: "muted" };
}

function PlayersStrip({
	players,
	selfId,
	currentPlayerId,
	currentPickerId,
}: {
	players: PlayerView[];
	selfId: string | null;
	currentPlayerId: string | null;
	currentPickerId: string | null;
}) {
	return (
		<section className="rounded-2xl border bg-card p-3">
			<ul className="grid grid-cols-2 gap-2">
				{players.map((p) => {
					const isMe = p.id === selfId;
					const isBuzzed = p.id === currentPlayerId;
					const isPicker = p.id === currentPickerId;
					const offline = p.status !== "joined";
					const initials = p.displayName
						.split(/\s+/)
						.map((s) => s[0])
						.filter(Boolean)
						.slice(0, 2)
						.join("")
						.toUpperCase();
					return (
						<li
							key={p.id}
							className={`relative flex items-center gap-2 rounded-xl border bg-input px-2 py-1.5 transition-all ${
								isBuzzed
									? "border-primary glow-primary"
									: isPicker
										? "border-[color:var(--gold)]/60"
										: "border-border"
							} ${offline ? "opacity-50" : ""}`}
						>
							<div
								className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-heading shrink-0 ${
									isMe
										? "bg-primary/25 border border-primary/60"
										: "bg-muted/40 border border-border"
								}`}
							>
								{initials || "?"}
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1">
									<span className="text-xs font-medium truncate">
										{p.displayName}
									</span>
									{isPicker && (
										<span className="text-[10px] text-[color:var(--gold)] shrink-0">
											★
										</span>
									)}
								</div>
								<span className="score text-xs">${p.score}</span>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function ClueCard({
	category,
	pointValue,
	isDailyDouble,
	isShot,
	currentWager,
	clue,
	media,
	youtubeId,
}: {
	category: string | null;
	pointValue: number;
	isDailyDouble: boolean;
	isShot: boolean;
	currentWager: number | null;
	clue: string;
	media: { id: string; mime: string; url: string }[];
	youtubeId: string | null;
}) {
	const stake = currentWager ?? pointValue;
	return (
		<section className="border rounded-2xl bg-card glow-primary overflow-hidden">
			<div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/60 bg-background/40">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground truncate">
					{category ?? "Question"}
				</p>
				<div className="flex items-center gap-2 shrink-0">
					{isDailyDouble && (
						<span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--gold)]">
							Daily Double
						</span>
					)}
					{isShot && (
						<span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--gold)] flex items-center gap-1">
							🥃 Shot
						</span>
					)}
					<span className="score text-sm font-bold rounded-md border border-[color:var(--gold)]/50 px-2 py-0.5">
						${stake}
					</span>
				</div>
			</div>
			{media.length > 0 && (
				<div className="px-4 pt-4 flex flex-wrap justify-center gap-2">
					{media.map((m) => (
						<img
							key={m.id}
							src={apiUrl(m.url)}
							alt=""
							className="max-h-56 max-w-full rounded-md border"
						/>
					))}
				</div>
			)}
			{youtubeId && (
				<div className="px-4 pt-4">
					<iframe
						src={`https://www.youtube.com/embed/${youtubeId}`}
						className="w-full aspect-video rounded-md border"
						allow="autoplay; encrypted-media"
						allowFullScreen
						title="Question video"
					/>
				</div>
			)}
			<p className="px-4 py-5 text-xl leading-snug font-medium text-center">
				{clue}
			</p>
		</section>
	);
}

function BuzzControl({
	canBuzz,
	lockedOut,
	inQueue,
	onBuzz,
}: {
	canBuzz: boolean;
	lockedOut: boolean;
	inQueue: boolean;
	onBuzz: () => void;
}) {
	const label = lockedOut ? "LOCKED" : inQueue ? "QUEUED" : "BUZZ";
	return (
		<button
			type="button"
			aria-label="Buzz"
			onClick={onBuzz}
			disabled={!canBuzz}
			className={`buzz w-full rounded-3xl font-heading font-bold text-3xl tracking-widest py-12 sm:py-16 select-none ${
				canBuzz ? "buzz-pulse" : ""
			}`}
		>
			{label}
		</button>
	);
}

function FinalPlayer({
	game,
	selfId,
	inFJ,
	onWager,
	onAnswer,
}: {
	game: GameView;
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
				<p className="text-base font-heading font-bold">{fj.category}</p>
			</section>
		);
	}

	const me = game.players.find((p) => p.id === selfId);
	const myMax = me?.score ?? 0;

	return (
		<section className="border rounded-2xl p-4 bg-card glow-primary space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--gold)] text-center">
				Final Jeopardy
			</p>
			<p className="text-base font-heading font-bold text-center">
				{fj.category}
			</p>

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
				className="w-full rounded-md border bg-input px-3 py-2 text-base focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
			/>
			<Button type="submit" className="w-full" disabled={!text.trim()}>
				Submit answer
			</Button>
		</form>
	);
}
