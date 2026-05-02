import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
		<div className="max-w-3xl mx-auto space-y-6">
			<header className="flex items-center justify-between">
				<h1 className="text-3xl font-heading font-bold">Game history</h1>
				<Link to="/me" className="text-sm underline">
					← Profile
				</Link>
			</header>

			{isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && (
				<p className="text-sm text-destructive">Could not load history.</p>
			)}

			{data && data.games.length === 0 && (
				<div className="border rounded-2xl p-8 text-center bg-card">
					<p className="text-muted-foreground">
						You haven't hosted or played in any games yet.
					</p>
				</div>
			)}

			{data && data.games.length > 0 && (
				<ul className="divide-y rounded-2xl border bg-card">
					{data.games.map((g) => {
						const when = g.endedAt ?? g.startedAt ?? g.createdAt;
						const completed = g.status === "completed";
						const inner = (
							<div className="flex items-center justify-between px-4 py-3">
								<div>
									<p className="room-code text-sm wordmark-accent">
										{g.roomCode}
									</p>
									<p className="text-xs text-muted-foreground">
										{g.role === "host" ? "Hosted" : "Played"} ·{" "}
										{new Date(when).toLocaleString()}
									</p>
								</div>
								<span
									className={`text-xs uppercase tracking-wider ${
										completed
											? "text-[color:var(--gold)]"
											: "text-muted-foreground"
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
										className="block hover:bg-muted/40"
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
		</div>
	);
}
