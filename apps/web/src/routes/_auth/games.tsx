import { GameController03Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "#/components/layout/page-header.tsx";
import { PageShell } from "#/components/layout/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { EmptyState } from "#/components/ui/empty-state.tsx";
import { api } from "#/lib/api.ts";

export const Route = createFileRoute("/_auth/games")({
	component: HistoryPage,
});

interface HistoryEntry {
	id: string;
	roomCode: string;
	status: string;
	role: "host" | "player";
	createdAt: string | Date;
	startedAt: string | Date | null;
	endedAt: string | Date | null;
	quizId: string | null;
}

function HistoryPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["games-history"],
		queryFn: async () => {
			const res = await api.games.history.get();
			if (res.error || !res.data || "error" in res.data)
				throw new Error("failed");
			return res.data as { games: HistoryEntry[] };
		},
	});

	return (
		<PageShell>
			<PageHeader
				title="Games"
				description="Recent rooms you've hosted or joined."
			/>

			{isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && (
				<p className="text-sm text-destructive">Could not load history.</p>
			)}

			{data && data.games.length === 0 && (
				<EmptyState
					icon={GameController03Icon}
					title="No games yet"
					description="Once you host or join a room, it'll show up here."
					action={
						<Link to="/quizzes">
							<Button size="lg">Go to quizzes</Button>
						</Link>
					}
				/>
			)}

			{data && data.games.length > 0 && (
				<ul className="divide-y divide-border/70 rounded-2xl border border-border bg-card/60 overflow-hidden">
					{data.games.map((g) => {
						const when = g.endedAt ?? g.startedAt ?? g.createdAt;
						const completed = g.status === "completed";
						const inner = (
							<div className="flex items-center justify-between px-4 py-3.5">
								<div className="min-w-0">
									<p className="room-code text-sm wordmark-accent">
										{g.roomCode}
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{g.role === "host" ? "Hosted" : "Played"} ·{" "}
										{new Date(when).toLocaleString()}
									</p>
								</div>
								<span
									className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-1 border ${
										completed
											? "text-[color:var(--gold)] border-[color:var(--gold)]/40 bg-[color:var(--gold-dim)]"
											: "text-muted-foreground border-border bg-muted/30"
									}`}
								>
									{g.status}
								</span>
							</div>
						);
						return (
							<li key={g.id}>
								{completed ? (
									<Link
										to="/games/$roomCode/result"
										params={{ roomCode: g.roomCode }}
										className="block hover:bg-muted/40 transition-colors"
									>
										{inner}
									</Link>
								) : (
									inner
								)}
							</li>
						);
					})}
				</ul>
			)}
		</PageShell>
	);
}
