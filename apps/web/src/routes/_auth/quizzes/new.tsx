import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "#/components/layout/page-header.tsx";
import { PageShell } from "#/components/layout/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { FormField } from "#/components/ui/form-field.tsx";
import { api } from "#/lib/api.ts";

export const Route = createFileRoute("/_auth/quizzes/new")({
	component: NewQuizPage,
});

function NewQuizPage() {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [title, setTitle] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const res = await api.quizzes.post({ title });
			if (res.error || !res.data) {
				setError("Could not create the quiz.");
				return;
			}
			const { quiz } = res.data as { quiz: { id: string } };
			await qc.invalidateQueries({ queryKey: ["quizzes"] });
			navigate({ to: "/quizzes/$quizId", params: { quizId: quiz.id } });
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<PageShell width="narrow">
			<PageHeader
				title="New quiz"
				description="Give it a title — you'll add categories and questions next."
				crumbs={[{ label: "Quizzes", to: "/quizzes" }, { label: "New" }]}
			/>
			<form
				onSubmit={onSubmit}
				className="rounded-2xl border border-border bg-card/60 p-5 sm:p-6 space-y-5"
			>
				<FormField
					label="Title"
					required
					minLength={1}
					maxLength={80}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					helper="You can change this later."
					error={error}
				/>
				<div className="flex gap-2 justify-end">
					<Link to="/quizzes">
						<Button variant="outline" type="button">
							Cancel
						</Button>
					</Link>
					<Button type="submit" disabled={submitting || !title.trim()}>
						{submitting ? "Creating…" : "Create quiz"}
					</Button>
				</div>
			</form>
		</PageShell>
	);
}
