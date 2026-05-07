import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("#/lib/api.ts", () => {
	const state: { found: boolean; quizTitle: string; ownerDisplayName: string } =
		{
			found: true,
			quizTitle: "A Quiz",
			ownerDisplayName: "Owner Name",
		};
	return {
		api: {
			share: (_: { token: string }) => ({
				get: async () =>
					state.found
						? {
								data: {
									quizTitle: state.quizTitle,
									ownerDisplayName: state.ownerDisplayName,
								},
								error: null,
							}
						: {
								data: null,
								error: { status: 404, value: { error: { code: "not_found" } } },
							},
			}),
		},
		__setShare: (next: Partial<typeof state>) => Object.assign(state, next),
	};
});

async function renderSharePage(token = "t0k3n") {
	const { Route: ShareRoute } = await import("#/routes/share.$token.tsx");
	const root = createRootRoute();
	const route = createRoute({
		getParentRoute: () => root,
		path: "/share/$token",
		component: ShareRoute.options.component,
	});
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: [`/share/${token}`] }),
	});
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={qc}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

describe("Share preview page", () => {
	it("shows the title and owner when the token resolves", async () => {
		await renderSharePage();
		await waitFor(
			() => {
				expect(screen.getByText("A Quiz")).toBeInTheDocument();
				expect(screen.getByText(/Owner Name/)).toBeInTheDocument();
			},
			{ timeout: 10000 },
		);
	}, 15000);

	it("shows a not-found state when the token does not resolve", async () => {
		const mod = (await import("#/lib/api.ts")) as unknown as {
			__setShare: (n: { found: boolean }) => void;
		};
		mod.__setShare({ found: false });
		await renderSharePage("bad");
		await waitFor(() => {
			expect(screen.getByText("Link not found")).toBeInTheDocument();
		});
	});
});
