import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "#/lib/api.ts";

export const Route = createFileRoute("/games/$roomCode/result")({
	component: ResultPage,
});

interface RankingEntry {
	playerId: string;
	displayName: string;
	score: number;
	rank: number;
}

interface ResultBody {
	game: {
		roomCode: string;
		hostId: string;
		startedAt: string | Date | null;
		endedAt: string | Date | null;
	};
	ranking: RankingEntry[];
}

function ResultPage() {
	const { roomCode } = Route.useParams();
	const code = roomCode.toUpperCase();
	const { data, isLoading, error } = useQuery<ResultBody>({
		queryKey: ["game-result", code],
		queryFn: async () => {
			const res = await api.games({ roomCode: code }).result.get();
			if (res.error || !res.data) throw new Error("not_found");
			return res.data as ResultBody;
		},
		retry: false,
	});

	if (isLoading) {
		return (
			<div className="min-h-[100dvh] flex items-center justify-center text-sm text-muted-foreground">
				Loading…
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 text-center space-y-3">
				<h1 className="text-2xl font-heading font-bold">No results yet</h1>
				<p className="text-sm text-muted-foreground">
					This game doesn't exist or hasn't finished.
				</p>
				<Link
					to="/"
					className="text-sm underline text-[color:var(--primary-bright)]"
				>
					← Home
				</Link>
			</div>
		);
	}

	return (
		<div className="min-h-[100dvh] px-4 py-8 max-w-md mx-auto space-y-5">
			<header className="text-center space-y-1">
				<p className="text-xs uppercase tracking-wider text-muted-foreground">
					Final results
				</p>
				<p className="room-code text-2xl wordmark-accent">
					{data.game.roomCode}
				</p>
				{data.game.endedAt && (
					<p className="text-xs text-muted-foreground">
						{new Date(data.game.endedAt).toLocaleString()}
					</p>
				)}
			</header>

			<section className="border rounded-2xl p-5 bg-card glow-primary">
				<ol className="space-y-2">
					{data.ranking.map((r) => (
						<li
							key={r.playerId}
							className={`flex items-center justify-between py-2 ${
								r.rank === 1
									? "border-b border-[color:var(--gold)]/40"
									: "border-b border-border"
							}`}
						>
							<span className="flex items-center gap-3">
								<span
									className={`font-heading font-bold text-lg w-6 text-right ${
										r.rank === 1
											? "text-[color:var(--gold)]"
											: "text-muted-foreground"
									}`}
								>
									{r.rank}
								</span>
								<span className="font-medium">{r.displayName}</span>
							</span>
							<span className="score text-lg">${r.score}</span>
						</li>
					))}
				</ol>
			</section>

			<div className="text-center">
				<Link
					to="/"
					className="text-sm underline text-[color:var(--primary-bright)]"
				>
					← Home
				</Link>
			</div>
		</div>
	);
}
