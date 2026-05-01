import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
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

			<h1 className="wordmark relative text-6xl sm:text-7xl md:text-8xl">
				Jeopardy<span className="wordmark-accent">Game</span>
			</h1>
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
		</div>
	);
}
