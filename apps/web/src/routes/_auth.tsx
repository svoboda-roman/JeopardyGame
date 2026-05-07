import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppHeader } from "#/components/layout/app-header.tsx";
import { ensureAuthLoaded } from "#/stores/auth.ts";

export const Route = createFileRoute("/_auth")({
	beforeLoad: async ({ location }) => {
		const user = await ensureAuthLoaded();
		if (!user) {
			throw redirect({ to: "/login", search: { next: location.href } });
		}
	},
	component: AuthLayout,
});

function AuthLayout() {
	return (
		<div className="min-h-[100dvh] flex flex-col">
			<AppHeader />
			<main className="flex-1">
				<Outlet />
			</main>
		</div>
	);
}
