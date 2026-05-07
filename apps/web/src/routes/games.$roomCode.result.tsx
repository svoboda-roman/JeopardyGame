import { GameController03Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandHeader } from "#/components/layout/brand-header.tsx";
import { Button } from "#/components/ui/button.tsx";
import { EmptyState } from "#/components/ui/empty-state.tsx";
import { api } from "#/lib/api.ts";
import { useAuth } from "#/stores/auth.ts";

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

function PageFrame({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-[100dvh] flex flex-col">
			<BrandHeader />
			<main className="flex-1 flex flex-col items-center px-4 pb-10">
				{children}
			</main>
		</div>
	);
}

function ResultPage() {
	const { roomCode } = Route.useParams();
	const code = roomCode.toUpperCase();
	const user = useAuth((s) => s.user);
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
			<PageFrame>
				<p className="mt-16 text-sm text-muted-foreground">Loading…</p>
			</PageFrame>
		);
	}

	if (error || !data) {
		return (
			<PageFrame>
				<div className="w-full max-w-md mt-8">
					<EmptyState
						icon={GameController03Icon}
						title="No results yet"
						description="This game doesn't exist or hasn't finished."
						action={
							<Link to="/">
								<Button>Back to home</Button>
							</Link>
						}
					/>
				</div>
			</PageFrame>
		);
	}

	return (
		<PageFrame>
			<div className="w-full max-w-md space-y-5">
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

				<div className="flex justify-center gap-2">
					<Link to="/">
						<Button variant="outline" size="sm">
							Back to home
						</Button>
					</Link>
					{user && (
						<Link to="/games">
							<Button variant="outline" size="sm">
								My games
							</Button>
						</Link>
					)}
				</div>
			</div>
		</PageFrame>
	);
}
