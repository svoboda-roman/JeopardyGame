import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { api } from "#/lib/api.ts";

export const Route = createFileRoute("/_auth/quizzes/new")({
	component: NewQuizPage,
});

function NewQuizPage() {
	const navigate = useNavigate();
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
			navigate({ to: "/quizzes/$quizId", params: { quizId: quiz.id } });
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="max-w-md mx-auto space-y-4">
			<h1 className="text-3xl font-bold">New quiz</h1>
			<form onSubmit={onSubmit} className="space-y-3">
				<div className="space-y-1">
					<label htmlFor="title" className="text-sm">
						Title
					</label>
					<input
						id="title"
						required
						minLength={1}
						maxLength={80}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className="w-full rounded-md border bg-background px-3 py-2"
					/>
				</div>
				{error && <p className="text-sm text-destructive">{error}</p>}
				<Button type="submit" disabled={submitting || !title.trim()}>
					{submitting ? "Creating…" : "Create quiz"}
				</Button>
			</form>
		</div>
	);
}
