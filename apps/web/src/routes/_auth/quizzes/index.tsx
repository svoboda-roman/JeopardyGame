import {
	Add01Icon,
	ArrowRight01Icon,
	BookOpen02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "#/components/layout/page-header.tsx";
import { PageShell } from "#/components/layout/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { EmptyState } from "#/components/ui/empty-state.tsx";
import { api } from "#/lib/api.ts";

export const Route = createFileRoute("/_auth/quizzes/")({
	component: QuizzesPage,
});

const AVATAR_TINTS = [
	"bg-[oklch(0.62_0.28_308/0.18)] text-[oklch(0.82_0.20_308)]",
	"bg-[oklch(0.62_0.20_220/0.18)] text-[oklch(0.82_0.16_220)]",
	"bg-[oklch(0.62_0.20_180/0.18)] text-[oklch(0.82_0.16_180)]",
	"bg-[oklch(0.62_0.22_140/0.18)] text-[oklch(0.82_0.18_140)]",
	"bg-[oklch(0.72_0.22_85/0.18)] text-[oklch(0.85_0.18_85)]",
	"bg-[oklch(0.65_0.24_25/0.18)] text-[oklch(0.82_0.18_25)]",
	"bg-[oklch(0.62_0.26_350/0.18)] text-[oklch(0.82_0.20_350)]",
	"bg-[oklch(0.62_0.20_265/0.18)] text-[oklch(0.82_0.18_265)]",
];

function hashString(s: string) {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
}

function initialOf(title: string) {
	const trimmed = title.trim();
	if (!trimmed) return "?";
	const ch = trimmed.charAt(0);
	return /[a-z0-9]/i.test(ch) ? ch.toUpperCase() : ch;
}

function QuizAvatar({ id, title }: { id: string; title: string }) {
	const tint = AVATAR_TINTS[hashString(id) % AVATAR_TINTS.length];
	return (
		<span
			aria-hidden
			className={`grid place-items-center size-10 rounded-lg shrink-0 font-heading font-bold text-base ${tint}`}
		>
			{initialOf(title)}
		</span>
	);
}

function QuizzesPage() {
	const navigate = useNavigate();
	const { data, isLoading, error } = useQuery({
		queryKey: ["quizzes"],
		queryFn: async () => {
			const res = await api.quizzes.get();
			if (res.error || !res.data || "error" in res.data)
				throw new Error("Failed to load quizzes");
			return res.data;
		},
	});

	return (
		<PageShell>
			<PageHeader
				title="Quizzes"
				description="Author quizzes you can host live."
				actions={
					<Button onClick={() => navigate({ to: "/quizzes/new" })}>
						<HugeiconsIcon icon={Add01Icon} size={16} aria-hidden />
						New quiz
					</Button>
				}
			/>

			{isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
			{error && (
				<p className="text-sm text-destructive">Could not load your quizzes.</p>
			)}

			{data && data.items.length === 0 && (
				<EmptyState
					icon={BookOpen02Icon}
					title="No quizzes yet"
					description="Create your first quiz to start hosting games."
					action={
						<Button size="lg" onClick={() => navigate({ to: "/quizzes/new" })}>
							<HugeiconsIcon icon={Add01Icon} size={16} aria-hidden />
							Create your first quiz
						</Button>
					}
				/>
			)}

			{data && data.items.length > 0 && (
				<ul className="divide-y divide-border/70 rounded-2xl border border-border bg-card/60 overflow-hidden">
					{data.items.map((q) => (
						<li key={q.id}>
							<Link
								to="/quizzes/$quizId"
								params={{ quizId: q.id }}
								className="group flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors"
							>
								<QuizAvatar id={q.id} title={q.title} />
								<span className="min-w-0 flex-1">
									<span className="block font-medium truncate">{q.title}</span>
									{q.description && (
										<span className="block text-sm text-muted-foreground line-clamp-1">
											{q.description}
										</span>
									)}
								</span>
								<HugeiconsIcon
									icon={ArrowRight01Icon}
									size={18}
									aria-hidden
									className="shrink-0 text-muted-foreground/60 transition-all group-hover:text-foreground group-hover:translate-x-0.5"
								/>
							</Link>
						</li>
					))}
				</ul>
			)}
		</PageShell>
	);
}
