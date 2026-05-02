import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "#/components/ui/button.tsx";
import { ensureAuthLoaded, useAuth } from "#/stores/auth.ts";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		await ensureAuthLoaded();
	},
	component: Home,
});

function Home() {
	const user = useAuth((s) => s.user);
	const signOut = useAuth((s) => s.signOut);
	const navigate = useNavigate();

	return (
		<div className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 gap-8 text-center overflow-hidden">
			{/* Faded board watermark behind the wordmark */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-2 p-6 opacity-[0.04]"
			>
				{Array.from({ length: 30 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: decorative
					<div key={i} className="rounded-md border border-foreground" />
				))}
			</div>

			{user && (
				<div className="absolute top-4 right-4 flex items-center gap-2 text-sm">
					<Link
						to="/me"
						className="text-muted-foreground hover:text-foreground transition-colors"
					>
						<span className="hidden sm:inline">Signed in as </span>
						<strong className="text-foreground">{user.name}</strong>
					</Link>
					<Button
						variant="outline"
						size="sm"
						onClick={async () => {
							await signOut();
							navigate({ to: "/" });
						}}
					>
						Sign out
					</Button>
				</div>
			)}

			<h1 className="wordmark relative text-6xl sm:text-7xl md:text-8xl">
				Jeopardy<span className="wordmark-accent">Game</span>
			</h1>

			{user ? (
				<>
					<p className="relative text-muted-foreground max-w-md text-base">
						Welcome back,{" "}
						<span className="text-foreground font-medium">{user.name}</span>.
						Pick up where you left off — or jump into someone else's game.
					</p>
					<div className="relative flex flex-wrap justify-center gap-3">
						<Link to="/quizzes">
							<Button size="lg">My quizzes</Button>
						</Link>
						<Link to="/join">
							<Button variant="outline" size="lg">
								Join with code
							</Button>
						</Link>
						<Link to="/games">
							<Button variant="outline" size="lg">
								Game history
							</Button>
						</Link>
					</div>
				</>
			) : (
				<>
					<p className="relative text-muted-foreground max-w-md text-base">
						Author quizzes, host live games, buzz in. Mobile-first.
					</p>
					<div className="relative flex flex-wrap justify-center gap-3">
						<Link to="/join">
							<Button size="lg">Join with code</Button>
						</Link>
						<Link to="/login">
							<Button variant="outline" size="lg">
								Log in
							</Button>
						</Link>
						<Link to="/register">
							<Button variant="outline" size="lg">
								Register
							</Button>
						</Link>
					</div>
				</>
			)}
		</div>
	);
}
