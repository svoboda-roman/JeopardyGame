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
	const state = {
		items: [] as {
			id: string;
			title: string;
			description: null;
			createdAt: string;
			updatedAt: string;
			ownerId: string;
		}[],
	};
	return {
		api: {
			quizzes: Object.assign(
				{
					get: async () => ({ data: state, error: null }),
				},
				// bracket-style not needed for this test
			),
		},
		__setQuizzes: (items: typeof state.items) => {
			state.items = items;
		},
	};
});

async function renderQuizzesPage() {
	const { Route: QuizzesRoute } = await import(
		"#/routes/_auth/quizzes/index.tsx"
	);
	const root = createRootRoute();
	const route = createRoute({
		getParentRoute: () => root,
		path: "/quizzes",
		component: QuizzesRoute.options.component,
	});
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/quizzes"] }),
	});
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={qc}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

describe("My Quizzes page", () => {
	it("shows empty state when there are no quizzes", async () => {
		await renderQuizzesPage();
		await waitFor(() => {
			expect(
				screen.getByText("You don't have any quizzes yet."),
			).toBeInTheDocument();
		});
		expect(screen.getByText("Create your first quiz")).toBeInTheDocument();
	});

	it("lists quizzes when present", async () => {
		const mod = (await import("#/lib/api.ts")) as unknown as {
			__setQuizzes: (
				items: {
					id: string;
					title: string;
					description: null;
					createdAt: string;
					updatedAt: string;
					ownerId: string;
				}[],
			) => void;
		};
		mod.__setQuizzes([
			{
				id: "q1",
				title: "First",
				description: null,
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-02T00:00:00Z",
				ownerId: "u1",
			},
			{
				id: "q2",
				title: "Second",
				description: null,
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-02T00:00:00Z",
				ownerId: "u1",
			},
		]);
		await renderQuizzesPage();
		await waitFor(() => {
			expect(screen.getByText("First")).toBeInTheDocument();
			expect(screen.getByText("Second")).toBeInTheDocument();
		});
	});
});
