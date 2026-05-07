import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { UnauthShell } from "#/components/layout/unauth-shell.tsx";
import { ensureAuthLoaded } from "#/stores/auth.ts";

export const Route = createFileRoute("/_unauth")({
	beforeLoad: async () => {
		const user = await ensureAuthLoaded();
		if (user) throw redirect({ to: "/me" });
	},
	component: UnauthLayout,
});

function UnauthLayout() {
	return (
		<UnauthShell>
			<Outlet />
		</UnauthShell>
	);
}
