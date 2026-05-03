import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Button } from "#/components/ui/button.tsx";

export const Route = createRootRoute({
	component: RootComponent,
	notFoundComponent: NotFound,
});

function RootComponent() {
	return (
		<>
			<Outlet />
			<TanStackRouterDevtools position="bottom-right" />
		</>
	);
}

function NotFound() {
	return (
		<div className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 gap-8 text-center overflow-hidden">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-2 p-6 opacity-[0.04]"
			>
				{Array.from({ length: 30 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: decorative
					<div key={i} className="rounded-md border border-foreground" />
				))}
			</div>

			<div className="relative flex flex-col items-center gap-4">
				<span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
					Answer
				</span>
				<h1 className="wordmark text-3xl sm:text-4xl md:text-5xl max-w-2xl">
					This page <span className="wordmark-accent">doesn't exist</span>
				</h1>
				<span className="text-xs uppercase tracking-[0.3em] text-muted-foreground mt-2">
					Question
				</span>
				<p className="text-muted-foreground max-w-md text-base">
					What is a wrong turn? Let's get you back to the board.
				</p>
			</div>

			<div className="relative flex flex-wrap justify-center gap-3">
				<Link to="/">
					<Button size="lg">Back to home</Button>
				</Link>
				<Link to="/join">
					<Button variant="outline" size="lg">
						Join with code
					</Button>
				</Link>
			</div>
		</div>
	);
}
