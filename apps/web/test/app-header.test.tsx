import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppHeader } from "#/components/layout/app-header.tsx";
import { useAuth } from "#/stores/auth.ts";

function renderHeader(initialPath = "/quizzes") {
	const root = createRootRoute({ component: AppHeader });
	const home = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => null,
	});
	const quizzes = createRoute({
		getParentRoute: () => root,
		path: "/quizzes",
		component: () => null,
	});
	const games = createRoute({
		getParentRoute: () => root,
		path: "/games",
		component: () => null,
	});
	const me = createRoute({
		getParentRoute: () => root,
		path: "/me",
		component: () => null,
	});
	const settings = createRoute({
		getParentRoute: () => root,
		path: "/settings",
		component: () => null,
	});
	const login = createRoute({
		getParentRoute: () => root,
		path: "/login",
		component: () => null,
	});
	const router = createRouter({
		routeTree: root.addChildren([home, quizzes, games, me, settings, login]),
		history: createMemoryHistory({ initialEntries: [initialPath] }),
	});
	return render(<RouterProvider router={router} />);
}

describe("AppHeader", () => {
	beforeEach(() => {
		useAuth.setState({
			user: null,
			loading: false,
			initialized: true,
		});
	});

	it("renders the wordmark linking home", async () => {
		renderHeader();
		const link = await screen.findByLabelText("JeopardyGame home");
		expect(link).toHaveAttribute("href", "/");
	});

	it("renders primary nav links", async () => {
		renderHeader();
		await waitFor(() => {
			expect(
				screen.getByRole("navigation", { name: "Primary" }),
			).toBeInTheDocument();
		});
		expect(screen.getAllByText("Quizzes").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Games").length).toBeGreaterThan(0);
	});

	it("shows a Log in link when no user", async () => {
		renderHeader();
		expect(
			await screen.findByRole("link", { name: "Log in" }),
		).toBeInTheDocument();
	});

	it("shows account menu trigger with initials when user is signed in", async () => {
		useAuth.setState({
			user: {
				id: "u1",
				name: "Ada Lovelace",
				email: "ada@example.com",
				emailVerified: true,
				image: null,
			},
			loading: false,
			initialized: true,
		});
		renderHeader();
		expect(
			await screen.findByRole("button", { name: "Account menu" }),
		).toBeInTheDocument();
		expect(screen.getByText("AL")).toBeInTheDocument();
	});
});
