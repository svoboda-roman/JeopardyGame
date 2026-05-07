import { BookOpen02Icon } from "@hugeicons/core-free-icons";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "#/components/ui/empty-state.tsx";

describe("EmptyState", () => {
	it("renders title, description, and action", () => {
		render(
			<EmptyState
				icon={BookOpen02Icon}
				title="No quizzes yet"
				description="Create your first quiz to start hosting games."
				action={<button type="button">Create your first quiz</button>}
			/>,
		);
		expect(screen.getByText("No quizzes yet")).toBeInTheDocument();
		expect(
			screen.getByText("Create your first quiz to start hosting games."),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Create your first quiz" }),
		).toBeInTheDocument();
	});

	it("renders without optional description and action", () => {
		render(<EmptyState icon={BookOpen02Icon} title="Empty" />);
		expect(screen.getByText("Empty")).toBeInTheDocument();
	});
});
