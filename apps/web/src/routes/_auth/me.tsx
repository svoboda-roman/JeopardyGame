import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "#/components/ui/button.tsx";
import { useAuth } from "#/stores/auth.ts";

export const Route = createFileRoute("/_auth/me")({
	component: MePage,
});

function MePage() {
	const navigate = useNavigate();
	const user = useAuth((s) => s.user);
	const signOut = useAuth((s) => s.signOut);

	if (!user) return null;

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">{user.name}</h1>
				<p className="text-sm text-muted-foreground">{user.email}</p>
			</header>

			{!user.emailVerified && (
				<div className="border rounded-lg p-4 bg-muted/40">
					<p className="text-sm font-medium">Verify your email</p>
					<p className="text-sm text-muted-foreground">
						You must verify your email before hosting a game.
					</p>
				</div>
			)}

			<div className="flex flex-wrap gap-2">
				<Link to="/quizzes">
					<Button>My quizzes</Button>
				</Link>
				<Link to="/settings">
					<Button variant="outline">Settings</Button>
				</Link>
				<Button
					variant="outline"
					onClick={async () => {
						await signOut();
						navigate({ to: "/login" });
					}}
				>
					Log out
				</Button>
			</div>
		</div>
	);
}
