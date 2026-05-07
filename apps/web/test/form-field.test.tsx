import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "#/components/ui/form-field.tsx";

describe("FormField", () => {
	it("links label to input via htmlFor/id", () => {
		render(<FormField label="Email" />);
		const input = screen.getByLabelText("Email");
		expect(input.tagName).toBe("INPUT");
	});

	it("shows helper text when no error", () => {
		render(<FormField label="Password" helper="At least 12 characters." />);
		expect(screen.getByText("At least 12 characters.")).toBeInTheDocument();
	});

	it("shows error and marks input invalid", () => {
		render(
			<FormField
				label="Password"
				helper="At least 12 characters."
				error="Too short."
			/>,
		);
		expect(screen.getByText("Too short.")).toBeInTheDocument();
		expect(
			screen.queryByText("At least 12 characters."),
		).not.toBeInTheDocument();
		const input = screen.getByLabelText("Password");
		expect(input).toHaveAttribute("aria-invalid", "true");
	});
});
