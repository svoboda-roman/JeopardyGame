import {
	BookOpen02Icon,
	GameController03Icon,
	Logout03Icon,
	Settings02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { PageHeader } from "#/components/layout/page-header.tsx";
import { PageShell } from "#/components/layout/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { useAuth } from "#/stores/auth.ts";

export const Route = createFileRoute("/_auth/me")({
	component: MePage,
});

type IconType = ComponentProps<typeof HugeiconsIcon>["icon"];

const tileClass =
	"group flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4 transition-colors hover:bg-card hover:border-primary/40";

function TileBody({
	icon,
	label,
	description,
	tone = "primary",
}: {
	icon: IconType;
	label: string;
	description: string;
	tone?: "primary" | "destructive";
}) {
	const wrap =
		tone === "destructive"
			? "bg-destructive/10 text-destructive"
			: "bg-primary/10 text-primary-bright group-hover:bg-primary/20";
	return (
		<>
			<span
				className={`grid place-items-center size-10 rounded-xl shrink-0 transition-colors ${wrap}`}
			>
				<HugeiconsIcon icon={icon} size={20} aria-hidden />
			</span>
			<span className="space-y-0.5 min-w-0">
				<span className="block font-medium">{label}</span>
				<span className="block text-xs text-muted-foreground">
					{description}
				</span>
			</span>
		</>
	);
}

function MePage() {
	const navigate = useNavigate();
	const user = useAuth((s) => s.user);
	const signOut = useAuth((s) => s.signOut);

	if (!user) return null;

	return (
		<PageShell width="narrow">
			<PageHeader title={user.name} description={user.email} />

			{!user.emailVerified && (
				<div className="rounded-2xl border border-[color:var(--gold)]/40 bg-[color:var(--gold-dim)] p-4">
					<p className="text-sm font-medium text-[color:var(--gold)]">
						Verify your email
					</p>
					<p className="text-sm text-muted-foreground mt-0.5">
						You must verify your email before hosting a game.
					</p>
				</div>
			)}

			<div className="grid gap-3 sm:grid-cols-2">
				<Link to="/quizzes" className={tileClass}>
					<TileBody
						icon={BookOpen02Icon}
						label="My quizzes"
						description="Author and edit quizzes."
					/>
				</Link>
				<Link to="/games" className={tileClass}>
					<TileBody
						icon={GameController03Icon}
						label="Game history"
						description="Rooms you've hosted or joined."
					/>
				</Link>
				<Link to="/settings" className={tileClass}>
					<TileBody
						icon={Settings02Icon}
						label="Settings"
						description="Account preferences."
					/>
				</Link>
				<button
					type="button"
					onClick={async () => {
						await signOut();
						navigate({ to: "/login" });
					}}
					className={`${tileClass} text-left hover:bg-destructive/10 hover:border-destructive/40`}
				>
					<TileBody
						icon={Logout03Icon}
						label="Log out"
						description="Sign out on this device."
						tone="destructive"
					/>
				</button>
			</div>

			<div className="pt-2 text-center">
				<Link to="/">
					<Button variant="ghost" size="sm">
						Back to home
					</Button>
				</Link>
			</div>
		</PageShell>
	);
}
