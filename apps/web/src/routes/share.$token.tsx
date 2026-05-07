import { Alert02Icon, BookOpen02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BrandHeader } from "#/components/layout/brand-header.tsx";
import { Button } from "#/components/ui/button.tsx";
import { EmptyState } from "#/components/ui/empty-state.tsx";
import { api } from "#/lib/api.ts";

export const Route = createFileRoute("/share/$token")({
	component: SharePreview,
});

function PageFrame({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-[100dvh] flex flex-col">
			<BrandHeader />
			<main className="flex-1 flex items-center justify-center px-4 pb-10">
				{children}
			</main>
		</div>
	);
}

function SharePreview() {
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const { data, isLoading, error } = useQuery({
		queryKey: ["share", token],
		queryFn: async () => {
			const res = await api.share({ token }).get();
			if (res.error || !res.data) throw new Error("not found");
			return res.data as {
				quizTitle: string;
				ownerDisplayName: string;
				activeRoomCode: string | null;
			};
		},
		retry: false,
		refetchInterval: 5000,
	});

	if (isLoading) {
		return (
			<PageFrame>
				<p className="text-sm text-muted-foreground">Loading…</p>
			</PageFrame>
		);
	}

	if (error || !data) {
		return (
			<PageFrame>
				<div className="w-full max-w-md">
					<EmptyState
						icon={Alert02Icon}
						title="Link not found"
						description="This share link is invalid or has been revoked."
						action={
							<Link to="/">
								<Button>Go home</Button>
							</Link>
						}
					/>
				</div>
			</PageFrame>
		);
	}

	return (
		<PageFrame>
			<div className="w-full max-w-md border border-border rounded-2xl p-7 bg-card glow-primary text-center space-y-4">
				<div className="mx-auto grid place-items-center size-12 rounded-full bg-primary/10 text-primary-bright">
					<HugeiconsIcon icon={BookOpen02Icon} size={22} aria-hidden />
				</div>
				<div className="space-y-1">
					<p className="text-xs uppercase tracking-wider text-muted-foreground">
						Quiz
					</p>
					<h1 className="text-2xl font-bold font-heading">{data.quizTitle}</h1>
					<p className="text-sm text-muted-foreground">
						by {data.ownerDisplayName}
					</p>
				</div>
				{data.activeRoomCode ? (
					<div className="pt-3 space-y-2 border-t border-border/70">
						<p className="text-xs uppercase tracking-wider text-muted-foreground pt-3">
							Room code
						</p>
						<p className="room-code text-2xl wordmark-accent">
							{data.activeRoomCode}
						</p>
						<Button
							size="lg"
							className="w-full"
							onClick={() =>
								navigate({
									to: "/join",
									search: { code: data.activeRoomCode ?? "" },
								})
							}
						>
							Join game
						</Button>
					</div>
				) : (
					<div className="pt-3 border-t border-border/70 flex items-center justify-center gap-2 text-xs text-muted-foreground">
						<span
							className="size-1.5 rounded-full bg-primary-bright animate-pulse"
							aria-hidden
						/>
						Waiting for the host to open a lobby…
					</div>
				)}
			</div>
		</PageFrame>
	);
}
