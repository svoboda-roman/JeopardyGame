import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "#/lib/api.ts";

export const Route = createFileRoute("/share/$token")({
	component: SharePreview,
});

function SharePreview() {
	const { token } = Route.useParams();
	const { data, isLoading, error } = useQuery({
		queryKey: ["share", token],
		queryFn: async () => {
			const res = await api.share({ token }).get();
			if (res.error || !res.data) throw new Error("not found");
			return res.data as { quizTitle: string; ownerDisplayName: string };
		},
		retry: false,
	});

	return (
		<div className="min-h-screen flex items-center justify-center px-4">
			<div className="w-full max-w-md border rounded-2xl p-6 text-center space-y-3">
				{isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
				{error && (
					<>
						<h1 className="text-2xl font-bold">Not found</h1>
						<p className="text-sm text-muted-foreground">
							This share link is invalid or has been revoked.
						</p>
						<Link to="/" className="underline text-sm">
							Go home
						</Link>
					</>
				)}
				{data && (
					<>
						<p className="text-sm uppercase tracking-wider text-muted-foreground">
							Quiz
						</p>
						<h1 className="text-2xl font-bold">{data.quizTitle}</h1>
						<p className="text-sm text-muted-foreground">
							by {data.ownerDisplayName}
						</p>
						<p className="text-xs text-muted-foreground pt-4">
							Wait for the host to start the game and share the room code.
						</p>
					</>
				)}
			</div>
		</div>
	);
}
