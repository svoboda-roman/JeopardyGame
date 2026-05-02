import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { api } from "#/lib/api.ts";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/_auth/quizzes/$quizId")({
	component: EditorPage,
});

interface Quiz {
	id: string;
	title: string;
	description: string | null;
}
interface Category {
	id: string;
	position: number;
	title: string;
	quizId: string;
}
interface Question {
	id: string;
	categoryId: string;
	position: number;
	pointValue: number;
	isDailyDouble: boolean;
	clue: string;
	answer: string;
}
interface QuizDetail {
	quiz: Quiz;
	categories: Category[];
	questions: Question[];
	finalQuestion: unknown | null;
}

function EditorPage() {
	const { quizId } = Route.useParams();
	const navigate = useNavigate();
	const qc = useQueryClient();

	const { data, isLoading, error } = useQuery<QuizDetail>({
		queryKey: ["quiz", quizId],
		queryFn: async () => {
			const res = await api.quizzes({ id: quizId }).get();
			if (res.error || !res.data) throw new Error("not found");
			return res.data as QuizDetail;
		},
	});

	const deleteMut = useMutation({
		mutationFn: async () => {
			await api.quizzes({ id: quizId }).delete();
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["quizzes"] });
			navigate({ to: "/quizzes" });
		},
	});

	if (isLoading)
		return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
	if (error || !data)
		return <p className="p-4 text-sm text-destructive">Quiz not found.</p>;

	return (
		<div className="max-w-6xl mx-auto space-y-6">
			<header className="flex flex-wrap items-center gap-2 justify-between">
				<Link to="/quizzes" className="text-sm underline">
					← All quizzes
				</Link>
				<div className="flex gap-2">
					<HostButton quizId={quizId} />
					<ShareButton quizId={quizId} />
					<Button
						variant="destructive"
						onClick={() => {
							if (confirm("Delete this quiz? This cannot be undone."))
								deleteMut.mutate();
						}}
					>
						Delete
					</Button>
				</div>
			</header>

			<TitleField quiz={data.quiz} />

			<Board
				categories={data.categories}
				questions={data.questions}
				quizId={quizId}
			/>
		</div>
	);
}

function TitleField({ quiz }: { quiz: Quiz }) {
	const qc = useQueryClient();
	const [value, setValue] = useState(quiz.title);
	const lastSent = useRef(quiz.title);

	async function save() {
		if (value === lastSent.current || value.trim().length === 0) return;
		lastSent.current = value;
		await api.quizzes({ id: quiz.id }).patch({ title: value });
		await qc.invalidateQueries({ queryKey: ["quizzes"] });
	}

	return (
		<input
			aria-label="Quiz title"
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onBlur={save}
			className="w-full text-3xl font-bold bg-transparent border-b py-2 focus:outline-none focus:border-primary"
			maxLength={80}
		/>
	);
}

function Board({
	categories,
	questions,
	quizId,
}: {
	categories: Category[];
	questions: Question[];
	quizId: string;
}) {
	const sortedCats = [...categories].sort((a, b) => a.position - b.position);
	const byCat = new Map<string, Question[]>();
	for (const c of sortedCats) byCat.set(c.id, []);
	for (const q of questions) byCat.get(q.categoryId)?.push(q);
	for (const arr of byCat.values()) arr.sort((a, b) => a.position - b.position);

	const [editing, setEditing] = useState<Question | null>(null);

	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
			{sortedCats.map((cat) => (
				<div key={cat.id} className="space-y-2">
					<CategoryField category={cat} quizId={quizId} />
					{(byCat.get(cat.id) ?? []).map((q) => (
						<button
							key={q.id}
							type="button"
							onClick={() => setEditing(q)}
							className="block w-full rounded-md border px-2 py-3 text-left hover:bg-muted/50"
						>
							<div className="text-xs text-muted-foreground flex items-center justify-between">
								<span>${q.pointValue}</span>
								{q.isDailyDouble && <span title="Daily Double">DD</span>}
							</div>
							<p className="text-sm line-clamp-2 mt-1">
								{q.clue || <em className="text-muted-foreground">empty</em>}
							</p>
						</button>
					))}
				</div>
			))}

			{editing && (
				<QuestionEditor
					question={editing}
					quizId={quizId}
					onClose={() => setEditing(null)}
				/>
			)}
		</div>
	);
}

function CategoryField({
	category,
	quizId,
}: {
	category: Category;
	quizId: string;
}) {
	const qc = useQueryClient();
	const [value, setValue] = useState(category.title);
	const lastSent = useRef(category.title);

	async function save() {
		if (value === lastSent.current || value.trim().length === 0) return;
		lastSent.current = value;
		await api.categories({ id: category.id }).patch({ title: value });
		await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
	}

	return (
		<input
			aria-label={`Category ${category.position + 1} title`}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onBlur={save}
			className="w-full font-semibold rounded-md border bg-background px-2 py-2 text-center"
			maxLength={40}
		/>
	);
}

function QuestionEditor({
	question,
	quizId,
	onClose,
}: {
	question: Question;
	quizId: string;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [clue, setClue] = useState(question.clue);
	const [answer, setAnswer] = useState(question.answer);
	const [pointValue, setPointValue] = useState(question.pointValue);
	const [isDD, setIsDD] = useState(question.isDailyDouble);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const clueId = useId();
	const answerId = useId();
	const pointsId = useId();

	// Close on Escape — keyboard a11y for the modal.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	// Debounced save: 500ms after last change.
	useEffect(() => {
		const handle = setTimeout(async () => {
			const changed =
				clue !== question.clue ||
				answer !== question.answer ||
				pointValue !== question.pointValue ||
				isDD !== question.isDailyDouble;
			if (!changed) return;
			await api
				.questions({ id: question.id })
				.patch({ clue, answer, pointValue, isDailyDouble: isDD });
			await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
			setSavedAt(Date.now());
		}, 500);
		return () => clearTimeout(handle);
	}, [clue, answer, pointValue, isDD, question, qc, quizId]);

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Edit question"
			className="fixed inset-0 z-10 p-4 flex items-center justify-center"
		>
			{/* Backdrop is a real button so click-away has built-in
			    keyboard a11y (Enter/Space close it too). The panel sits
			    on top of it — no event-bubbling tricks needed. */}
			<button
				type="button"
				aria-label="Close dialog"
				className="absolute inset-0 bg-background/90 backdrop-blur"
				onClick={onClose}
			/>
			<div className="relative bg-card border rounded-2xl p-4 w-full max-w-lg space-y-3">
				<header className="flex items-center justify-between">
					<h2 className="font-semibold">Question</h2>
					<button type="button" onClick={onClose} className="text-sm underline">
						Close
					</button>
				</header>
				<div className="space-y-1">
					<label htmlFor={clueId} className="text-sm">
						Clue
					</label>
					<textarea
						id={clueId}
						value={clue}
						onChange={(e) => setClue(e.target.value)}
						maxLength={500}
						rows={3}
						className="w-full rounded-md border bg-background px-2 py-1"
					/>
				</div>
				<div className="space-y-1">
					<label htmlFor={answerId} className="text-sm">
						Answer
					</label>
					<input
						id={answerId}
						value={answer}
						onChange={(e) => setAnswer(e.target.value)}
						maxLength={200}
						className="w-full rounded-md border bg-background px-2 py-1"
					/>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1">
						<label htmlFor={pointsId} className="text-sm">
							Points
						</label>
						<input
							id={pointsId}
							type="number"
							min={100}
							max={2000}
							step={100}
							value={pointValue}
							onChange={(e) => setPointValue(Number(e.target.value))}
							className="w-full rounded-md border bg-background px-2 py-1"
						/>
					</div>
					<label className="flex items-end gap-2">
						<input
							type="checkbox"
							checked={isDD}
							onChange={(e) => setIsDD(e.target.checked)}
						/>
						<span className="text-sm">Daily Double</span>
					</label>
				</div>
				<p className="text-xs text-muted-foreground h-4">
					{savedAt && `Saved at ${new Date(savedAt).toLocaleTimeString()}`}
				</p>
			</div>
		</div>
	);
}

function HostButton({ quizId }: { quizId: string }) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [finalEnabled, setFinalEnabled] = useState(true);
	const [readDelayMs, setReadDelayMs] = useState(3000);
	const finalId = useId();
	const delayId = useId();

	async function host() {
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(`${apiUrl}/games`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					quizId,
					options: { finalEnabled, readDelayMs },
				}),
			});
			if (res.status === 409) {
				setError("You already have an active game.");
				return;
			}
			if (!res.ok) {
				setError("Could not start a game.");
				return;
			}
			const body = (await res.json()) as { game: { roomCode: string } };
			navigate({
				to: "/host/$roomCode",
				params: { roomCode: body.game.roomCode },
			});
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<>
			<Button onClick={() => setOpen(true)}>Host game</Button>
			{error && <span className="text-xs text-destructive">{error}</span>}
			{open && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Host game options"
					className="fixed inset-0 z-20 p-4 flex items-center justify-center"
				>
					<button
						type="button"
						aria-label="Close dialog"
						className="absolute inset-0 bg-background/90 backdrop-blur"
						onClick={() => setOpen(false)}
					/>
					<div className="relative bg-card border rounded-2xl p-5 w-full max-w-sm space-y-4 glow-primary">
						<h2 className="font-heading font-bold text-lg">Game options</h2>
						<label
							htmlFor={finalId}
							className="flex items-center gap-3 text-sm cursor-pointer"
						>
							<input
								id={finalId}
								type="checkbox"
								checked={finalEnabled}
								onChange={(e) => setFinalEnabled(e.target.checked)}
								className="size-4"
							/>
							<span>
								<span className="block font-medium">Final Jeopardy</span>
								<span className="block text-xs text-muted-foreground">
									Play a final round after the board is cleared (requires a
									final question on the quiz).
								</span>
							</span>
						</label>
						<div className="space-y-1">
							<label
								htmlFor={delayId}
								className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
							>
								Read delay (ms)
							</label>
							<input
								id={delayId}
								type="number"
								min={0}
								max={10000}
								step={500}
								value={readDelayMs}
								onChange={(e) => setReadDelayMs(Number(e.target.value))}
								className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
							/>
							<p className="text-xs text-muted-foreground">
								Time before buzzers open after the host opens a clue.
							</p>
						</div>
						<div className="flex gap-2 justify-end">
							<Button variant="outline" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button onClick={host} disabled={busy}>
								{busy ? "Starting…" : "Start game"}
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

function ShareButton({ quizId }: { quizId: string }) {
	const [token, setToken] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function onClick() {
		setBusy(true);
		try {
			const res = await api.quizzes({ id: quizId }).share.post();
			if (res.error || !res.data) return;
			const { share } = res.data as { share: { token: string } };
			setToken(share.token);
			await navigator.clipboard.writeText(
				`${window.location.origin}/share/${share.token}`,
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Button variant="outline" onClick={onClick} disabled={busy}>
			{token ? "Link copied" : busy ? "Sharing…" : "Share link"}
		</Button>
	);
}
