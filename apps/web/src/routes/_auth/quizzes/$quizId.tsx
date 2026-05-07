import {
	CheckmarkCircle01Icon,
	Delete02Icon,
	HelpCircleIcon,
	Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageHeader } from "#/components/layout/page-header.tsx";
import { PageShell } from "#/components/layout/page-shell.tsx";
import { MediaPicker, type PickedMedia } from "#/components/MediaPicker.tsx";
import { Button } from "#/components/ui/button.tsx";
import { api } from "#/lib/api.ts";
import { extractYouTubeId } from "#/lib/utils.ts";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/_auth/quizzes/$quizId")({
	component: EditorPage,
});

interface Quiz {
	id: string;
	title: string;
	description: string | null;
	settings: Record<string, unknown>;
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
	media: PickedMedia[];
	answerMedia: PickedMedia[];
	youtubeId: string | null;
	answerYoutubeId: string | null;
	hostNotes: string | null;
	buzzWindowMs: number | null;
}
interface FinalQuestion {
	id: string;
	quizId: string;
	category: string;
	clue: string;
	answer: string;
}
interface QuizDetail {
	quiz: Quiz;
	categories: Category[];
	questions: Question[];
	finalQuestion: FinalQuestion | null;
}

function parseSettings(raw: Record<string, unknown>): GameSettings {
	return {
		manualPoints:
			typeof raw.manualPoints === "boolean" ? raw.manualPoints : false,
		finalEnabled:
			typeof raw.finalEnabled === "boolean" ? raw.finalEnabled : true,
		readDelayMs: typeof raw.readDelayMs === "number" ? raw.readDelayMs : 3000,
		allowReopen: typeof raw.allowReopen === "boolean" ? raw.allowReopen : false,
		ddCount: typeof raw.ddCount === "number" ? raw.ddCount : 0,
	};
}

function EditorPage() {
	const { quizId } = Route.useParams();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const [settings, setSettings] = useState<GameSettings | null>(null);
	const pendingSettingsRef = useRef<GameSettings | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const { data, isLoading, error } = useQuery<QuizDetail>({
		queryKey: ["quiz", quizId],
		queryFn: async () => {
			const res = await api.quizzes({ id: quizId }).get();
			if (res.error || !res.data) throw new Error("not found");
			return res.data as QuizDetail;
		},
	});

	// Initialise settings from the server once data is loaded.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only runs when data arrives
	useEffect(() => {
		if (data && settings === null) {
			setSettings(parseSettings(data.quiz.settings ?? {}));
		}
	}, [data]);

	const saveSettings = useCallback(
		(s: GameSettings) => {
			qc.setQueryData<QuizDetail>(["quiz", quizId], (prev) =>
				prev
					? {
							...prev,
							quiz: {
								...prev.quiz,
								settings: s as unknown as Record<string, unknown>,
							},
						}
					: prev,
			);
			void api.quizzes({ id: quizId }).patch({ settings: s });
		},
		[qc, quizId],
	);

	const flushSettings = useCallback(() => {
		const pending = pendingSettingsRef.current;
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		if (!pending) return;
		pendingSettingsRef.current = null;
		saveSettings(pending);
	}, [saveSettings]);

	// Debounce-save settings whenever they change. On unmount, flush immediately
	// so navigating away before the 600ms window doesn't lose the change.
	useEffect(() => {
		if (!settings) return;
		pendingSettingsRef.current = settings;
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			pendingSettingsRef.current = null;
			saveSettings(settings);
		}, 600);
	}, [settings, saveSettings]);

	useEffect(() => {
		return () => flushSettings();
	}, [flushSettings]);

	// Flush pending changes when the tab is hidden — prevents losing a
	// toggle made just before closing the tab or switching away.
	useEffect(() => {
		function onVisibility() {
			if (document.visibilityState === "hidden") flushSettings();
		}
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, [flushSettings]);

	const deleteMut = useMutation({
		mutationFn: async () => {
			await api.quizzes({ id: quizId }).delete();
		},
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["quizzes"] });
			navigate({ to: "/quizzes" });
		},
	});

	if (isLoading || !settings)
		return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
	if (error || !data)
		return <p className="p-4 text-sm text-destructive">Quiz not found.</p>;

	return (
		<PageShell width="wide">
			<PageHeader
				title={data.quiz.title || "Untitled quiz"}
				description="Edit categories, questions, and game settings. Changes save automatically."
				crumbs={[
					{ label: "Quizzes", to: "/quizzes" },
					{ label: data.quiz.title || "Untitled" },
				]}
				actions={
					<>
						<GameSettingsContext
							quizId={quizId}
							settings={settings}
							finalQuestion={data.finalQuestion}
							onChange={(s) => setSettings(s)}
							onFlush={flushSettings}
						/>
						<Button
							variant="destructive"
							onClick={() => {
								if (confirm("Delete this quiz? This cannot be undone."))
									deleteMut.mutate();
							}}
						>
							Delete
						</Button>
					</>
				}
			/>

			<Board
				categories={data.categories}
				questions={data.questions}
				quizId={quizId}
				manualPoints={settings.manualPoints}
			/>

			{settings.finalEnabled && (
				<FinalQuestionSection
					quizId={quizId}
					finalQuestion={data.finalQuestion}
				/>
			)}
		</PageShell>
	);
}

function Board({
	categories,
	questions,
	quizId,
	manualPoints,
}: {
	categories: Category[];
	questions: Question[];
	quizId: string;
	manualPoints: boolean;
}) {
	const qc = useQueryClient();
	const sortedCats = [...categories].sort((a, b) => a.position - b.position);
	const byCat = new Map<string, Question[]>();
	for (const c of sortedCats) byCat.set(c.id, []);
	for (const q of questions) byCat.get(q.categoryId)?.push(q);
	for (const arr of byCat.values()) arr.sort((a, b) => a.position - b.position);

	const [editing, setEditing] = useState<Question | null>(null);
	const [busy, setBusy] = useState(false);

	async function addCategory() {
		setBusy(true);
		try {
			await api.quizzes({ id: quizId }).categories.post();
			await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
		} finally {
			setBusy(false);
		}
	}

	async function removeCategory(cat: Category) {
		if (sortedCats.length <= 1) return;
		const ok = window.confirm(
			`Remove category "${cat.title}" and all its questions?`,
		);
		if (!ok) return;
		setBusy(true);
		try {
			await api.categories({ id: cat.id }).delete();
			await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
				{sortedCats.map((cat) => (
					<div key={cat.id} className="space-y-2">
						<CategoryField
							category={cat}
							quizId={quizId}
							onRemove={
								sortedCats.length > 1 ? () => removeCategory(cat) : null
							}
							removeDisabled={busy}
						/>
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
			</div>

			<div className="flex justify-center">
				<Button
					variant="outline"
					size="sm"
					onClick={addCategory}
					disabled={busy}
				>
					{busy ? "…" : "+ Add category"}
				</Button>
			</div>

			{editing && (
				<QuestionEditor
					question={editing}
					quizId={quizId}
					manualPoints={manualPoints}
					onClose={() => setEditing(null)}
				/>
			)}
		</div>
	);
}

function CategoryField({
	category,
	quizId,
	onRemove,
	removeDisabled,
}: {
	category: Category;
	quizId: string;
	onRemove: (() => void) | null;
	removeDisabled: boolean;
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
		<div className="relative group">
			<input
				aria-label={`Category ${category.position + 1} title`}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onBlur={save}
				className="w-full font-semibold rounded-md border bg-background pl-2 pr-9 py-2 text-center focus:outline-none focus:border-primary"
				maxLength={40}
			/>
			{onRemove && (
				<button
					type="button"
					aria-label={`Remove ${category.title}`}
					title="Remove category"
					onClick={onRemove}
					disabled={removeDisabled}
					className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
				>
					<HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
				</button>
			)}
		</div>
	);
}

function QuestionEditor({
	question,
	quizId,
	manualPoints,
	onClose,
}: {
	question: Question;
	quizId: string;
	manualPoints: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [tab, setTab] = useState<"question" | "answer" | "options">("question");
	const [clue, setClue] = useState(question.clue);
	const [answer, setAnswer] = useState(question.answer);
	const [pointValue, setPointValue] = useState(question.pointValue);
	const [isDD, setIsDD] = useState(question.isDailyDouble);
	const [media, setMedia] = useState<PickedMedia[]>(question.media ?? []);
	const [answerMedia, setAnswerMedia] = useState<PickedMedia[]>(
		question.answerMedia ?? [],
	);
	const [youtubeUrl, setYoutubeUrl] = useState(
		question.youtubeId
			? `https://www.youtube.com/watch?v=${question.youtubeId}`
			: "",
	);
	const [answerYoutubeUrl, setAnswerYoutubeUrl] = useState(
		question.answerYoutubeId
			? `https://www.youtube.com/watch?v=${question.answerYoutubeId}`
			: "",
	);
	const [hostNotes, setHostNotes] = useState(question.hostNotes ?? "");
	const [buzzWindowMs, setBuzzWindowMs] = useState<number | null>(
		question.buzzWindowMs ?? null,
	);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const clueId = useId();
	const answerId = useId();
	const pointsId = useId();
	const clueVideoId = useId();
	const answerVideoId = useId();
	const hostNotesId = useId();
	const buzzWindowId = useId();

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	// Debounced autosave: 500ms after last change.
	useEffect(() => {
		const handle = setTimeout(async () => {
			const prevMediaIds = (question.media ?? []).map((m) => m.id);
			const nextMediaIds = media.map((m) => m.id);
			const mediaChanged =
				prevMediaIds.length !== nextMediaIds.length ||
				prevMediaIds.some((id, i) => id !== nextMediaIds[i]);
			const prevAnswerMediaIds = (question.answerMedia ?? []).map((m) => m.id);
			const nextAnswerMediaIds = answerMedia.map((m) => m.id);
			const answerMediaChanged =
				prevAnswerMediaIds.length !== nextAnswerMediaIds.length ||
				prevAnswerMediaIds.some((id, i) => id !== nextAnswerMediaIds[i]);
			const nextYoutubeId = extractYouTubeId(youtubeUrl);
			const nextAnswerYoutubeId = extractYouTubeId(answerYoutubeUrl);
			const youtubeChanged = nextYoutubeId !== question.youtubeId;
			const answerYoutubeChanged =
				nextAnswerYoutubeId !== question.answerYoutubeId;
			const hostNotesChanged = hostNotes !== (question.hostNotes ?? "");
			const buzzWindowChanged =
				buzzWindowMs !== (question.buzzWindowMs ?? null);
			const changed =
				clue !== question.clue ||
				answer !== question.answer ||
				pointValue !== question.pointValue ||
				isDD !== question.isDailyDouble ||
				mediaChanged ||
				answerMediaChanged ||
				youtubeChanged ||
				answerYoutubeChanged ||
				hostNotesChanged ||
				buzzWindowChanged;
			if (!changed) return;
			await api.questions({ id: question.id }).patch({
				clue,
				answer,
				pointValue,
				isDailyDouble: isDD,
				...(mediaChanged ? { mediaIds: nextMediaIds } : {}),
				...(answerMediaChanged ? { answerMediaIds: nextAnswerMediaIds } : {}),
				...(youtubeChanged ? { youtubeId: nextYoutubeId } : {}),
				...(answerYoutubeChanged
					? { answerYoutubeId: nextAnswerYoutubeId }
					: {}),
				...(hostNotesChanged ? { hostNotes: hostNotes || null } : {}),
				...(buzzWindowChanged ? { buzzWindowMs } : {}),
			});
			await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
			setSavedAt(Date.now());
		}, 500);
		return () => clearTimeout(handle);
	}, [
		clue,
		answer,
		pointValue,
		isDD,
		media,
		answerMedia,
		youtubeUrl,
		answerYoutubeUrl,
		hostNotes,
		buzzWindowMs,
		question,
		qc,
		quizId,
	]);

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Edit question"
			className="fixed inset-0 z-10 flex items-center justify-center p-4"
		>
			<button
				type="button"
				aria-label="Close dialog"
				className="absolute inset-0 bg-background/80 backdrop-blur-sm"
				onClick={onClose}
			/>

			<div className="relative bg-card border rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90dvh]">
				{/* Header */}
				<div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
					<h2 className="font-heading font-bold text-lg">Edit question</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
					>
						Close ✕
					</button>
				</div>

				{/* Tabs */}
				<div className="flex border-b border-border mx-5 shrink-0">
					<button
						type="button"
						onClick={() => setTab("question")}
						className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
							tab === "question"
								? "border-primary text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<span
							className={`flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold ${tab === "question" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
						>
							<HugeiconsIcon icon={HelpCircleIcon} size={13} strokeWidth={2} />
						</span>
						Question
					</button>
					<button
						type="button"
						onClick={() => setTab("answer")}
						className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
							tab === "answer"
								? "border-emerald-500 text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<span
							className={`flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold ${tab === "answer" ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}
						>
							<HugeiconsIcon
								icon={CheckmarkCircle01Icon}
								size={13}
								strokeWidth={2}
							/>
						</span>
						Answer
					</button>
					<button
						type="button"
						onClick={() => setTab("options")}
						className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
							tab === "options"
								? "border-muted-foreground text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<span
							className={`flex items-center justify-center w-5 h-5 rounded ${tab === "options" ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"}`}
						>
							<HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={2} />
						</span>
						Options
					</button>
				</div>

				{/* Scrollable body */}
				<div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
					{tab === "question" ? (
						<>
							<div className="space-y-1.5">
								<textarea
									id={clueId}
									value={clue}
									onChange={(e) => setClue(e.target.value)}
									maxLength={1000}
									rows={4}
									placeholder="Write your question here…"
									className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-right text-xs text-muted-foreground">
									{clue.length} / 1000
								</p>
							</div>
							<div className="space-y-1.5">
								<span className="text-sm font-medium">Question pictures</span>
								<MediaPicker value={media} onChange={setMedia} />
							</div>
							<div className="space-y-1.5">
								<label htmlFor={clueVideoId} className="text-sm font-medium">
									Question video{" "}
									<span className="font-normal text-muted-foreground">
										(YouTube URL or ID)
									</span>
								</label>
								<input
									id={clueVideoId}
									value={youtubeUrl}
									onChange={(e) => setYoutubeUrl(e.target.value)}
									placeholder="https://youtu.be/…"
									className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
								/>
								{extractYouTubeId(youtubeUrl) && (
									<iframe
										src={`https://www.youtube.com/embed/${extractYouTubeId(youtubeUrl)}`}
										className="w-full aspect-video rounded-md border mt-1"
										allow="autoplay; encrypted-media"
										allowFullScreen
										title="Clue video preview"
									/>
								)}
							</div>
						</>
					) : tab === "answer" ? (
						<>
							<div className="space-y-1.5">
								<textarea
									id={answerId}
									value={answer}
									onChange={(e) => setAnswer(e.target.value)}
									maxLength={1000}
									rows={4}
									placeholder="Write the answer here…"
									className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
								/>
								<p className="text-right text-xs text-muted-foreground">
									{answer.length} / 1000
								</p>
							</div>
							<div className="space-y-1.5">
								<span className="text-sm font-medium">Answer pictures</span>
								<MediaPicker value={answerMedia} onChange={setAnswerMedia} />
							</div>
							<div className="space-y-1.5">
								<label htmlFor={answerVideoId} className="text-sm font-medium">
									Answer video{" "}
									<span className="font-normal text-muted-foreground">
										(YouTube URL or ID)
									</span>
								</label>
								<input
									id={answerVideoId}
									value={answerYoutubeUrl}
									onChange={(e) => setAnswerYoutubeUrl(e.target.value)}
									placeholder="https://youtu.be/…"
									className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
								/>
								{extractYouTubeId(answerYoutubeUrl) && (
									<iframe
										src={`https://www.youtube.com/embed/${extractYouTubeId(answerYoutubeUrl)}`}
										className="w-full aspect-video rounded-md border mt-1"
										allow="autoplay; encrypted-media"
										allowFullScreen
										title="Answer video preview"
									/>
								)}
							</div>
						</>
					) : (
						<div className="space-y-6">
							{/* Row 1: Points + Delay side by side */}
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<label htmlFor={pointsId} className="text-sm font-medium">
										Points
									</label>
									{manualPoints ? (
										<div className="w-full rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed">
											Manual point assignment is on
										</div>
									) : (
										<input
											id={pointsId}
											type="number"
											min={100}
											max={2000}
											step={100}
											value={pointValue}
											onChange={(e) => setPointValue(Number(e.target.value))}
											className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
										/>
									)}
								</div>
								<div className="space-y-1.5">
									<label htmlFor={buzzWindowId} className="text-sm font-medium">
										Delay before buzz{" "}
										<span className="font-normal text-muted-foreground">
											(ms)
										</span>
									</label>
									<input
										id={buzzWindowId}
										type="number"
										min={0}
										max={30000}
										step={500}
										placeholder="Global default"
										value={buzzWindowMs ?? ""}
										onChange={(e) =>
											setBuzzWindowMs(
												e.target.value === "" ? null : Number(e.target.value),
											)
										}
										className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									/>
								</div>
							</div>

							{/* Row 2: Daily Double toggle */}
							<label className="flex items-center gap-3 cursor-pointer w-fit">
								<input
									type="checkbox"
									checked={isDD}
									onChange={(e) => setIsDD(e.target.checked)}
									className="size-4 rounded"
								/>
								<span className="text-sm font-medium">Daily Double</span>
							</label>

							{/* Row 3: Host notes full width */}
							<div className="space-y-1.5">
								<div className="flex items-baseline justify-between">
									<label htmlFor={hostNotesId} className="text-sm font-medium">
										Host notes
									</label>
									<span className="text-xs text-muted-foreground">
										{hostNotes.length} / 1000
									</span>
								</div>
								<textarea
									id={hostNotesId}
									value={hostNotes}
									onChange={(e) => setHostNotes(e.target.value)}
									maxLength={1000}
									rows={5}
									placeholder="Alternate answers, judging guidance…"
									className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
								/>
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-5 py-4 border-t border-border shrink-0">
					<p className="text-xs text-muted-foreground">
						{savedAt
							? `Saved at ${new Date(savedAt).toLocaleTimeString()}`
							: "Changes save automatically"}
					</p>
					<div className="flex gap-2">
						<Button variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button onClick={onClose}>Done</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function FinalQuestionSection({
	quizId,
	finalQuestion,
}: {
	quizId: string;
	finalQuestion: FinalQuestion | null;
}) {
	const qc = useQueryClient();
	const categoryId = useId();
	const clueId = useId();
	const answerId = useId();

	const [category, setCategory] = useState(finalQuestion?.category ?? "");
	const [clue, setClue] = useState(finalQuestion?.clue ?? "");
	const [answer, setAnswer] = useState(finalQuestion?.answer ?? "");
	const [savedAt, setSavedAt] = useState<number | null>(null);

	// Reset local state when the server snapshot changes (e.g. after a delete).
	const lastSeenIdRef = useRef<string | null>(finalQuestion?.id ?? null);
	useEffect(() => {
		const incomingId = finalQuestion?.id ?? null;
		if (incomingId !== lastSeenIdRef.current) {
			lastSeenIdRef.current = incomingId;
			setCategory(finalQuestion?.category ?? "");
			setClue(finalQuestion?.clue ?? "");
			setAnswer(finalQuestion?.answer ?? "");
		}
	}, [finalQuestion]);

	// Debounced save: only when all three fields have content and something changed.
	useEffect(() => {
		const cat = category.trim();
		const cl = clue.trim();
		const an = answer.trim();
		if (!cat || !cl || !an) return;
		const changed =
			cat !== (finalQuestion?.category ?? "") ||
			cl !== (finalQuestion?.clue ?? "") ||
			an !== (finalQuestion?.answer ?? "");
		if (!changed) return;
		const handle = setTimeout(async () => {
			await api
				.quizzes({ id: quizId })
				.final.put({ category: cat, clue: cl, answer: an });
			await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
			setSavedAt(Date.now());
		}, 500);
		return () => clearTimeout(handle);
	}, [category, clue, answer, finalQuestion, qc, quizId]);

	async function remove() {
		if (!finalQuestion) return;
		const ok = window.confirm("Remove the Final Jeopardy question?");
		if (!ok) return;
		await api.quizzes({ id: quizId }).final.delete();
		await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
	}

	const incomplete = !category.trim() || !clue.trim() || !answer.trim();
	const status = finalQuestion
		? incomplete
			? "Fill all three fields to save."
			: savedAt
				? "Saved"
				: "Changes save automatically"
		: incomplete
			? "Fill all three fields to enable Final Jeopardy."
			: "Saving…";

	return (
		<section className="mt-8 space-y-3">
			<div className="flex items-end justify-between gap-3">
				<div>
					<h2 className="font-heading font-bold text-lg">Final Jeopardy</h2>
					<p className="text-xs text-muted-foreground">
						One bonus question played after the board is cleared. Required if
						the Final Jeopardy setting is on.
					</p>
				</div>
				{finalQuestion && (
					<Button variant="outline" size="sm" onClick={remove}>
						Remove
					</Button>
				)}
			</div>

			<div className="rounded-2xl border bg-card p-4 space-y-3">
				<div className="space-y-1">
					<label
						htmlFor={categoryId}
						className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
					>
						Category
					</label>
					<input
						id={categoryId}
						type="text"
						maxLength={40}
						value={category}
						onChange={(e) => setCategory(e.target.value)}
						placeholder="e.g. World Capitals"
						className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
					/>
				</div>

				<div className="space-y-1">
					<label
						htmlFor={clueId}
						className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
					>
						Clue
					</label>
					<textarea
						id={clueId}
						maxLength={500}
						rows={3}
						value={clue}
						onChange={(e) => setClue(e.target.value)}
						placeholder="The clue revealed once everyone has wagered."
						className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
					/>
				</div>

				<div className="space-y-1">
					<label
						htmlFor={answerId}
						className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
					>
						Answer
					</label>
					<input
						id={answerId}
						type="text"
						maxLength={200}
						value={answer}
						onChange={(e) => setAnswer(e.target.value)}
						placeholder="The correct response."
						className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
					/>
				</div>

				<p className="text-xs text-muted-foreground">{status}</p>
			</div>
		</section>
	);
}

interface GameSettings {
	manualPoints: boolean;
	finalEnabled: boolean;
	readDelayMs: number;
	allowReopen: boolean;
	ddCount: number;
}

function GameSettingsContext({
	quizId,
	settings,
	finalQuestion,
	onChange,
	onFlush,
}: {
	quizId: string;
	settings: GameSettings;
	finalQuestion: FinalQuestion | null;
	onChange: (s: GameSettings) => void;
	onFlush: () => void;
}) {
	return (
		<>
			<HostButton
				quizId={quizId}
				settings={settings}
				finalQuestion={finalQuestion}
			/>
			<SettingsButton
				settings={settings}
				onChange={onChange}
				onFlush={onFlush}
			/>
		</>
	);
}

function SettingsButton({
	settings,
	onChange,
	onFlush,
}: {
	settings: GameSettings;
	onChange: (s: GameSettings) => void;
	onFlush: () => void;
}) {
	const [open, setOpen] = useState(false);
	const manualId = useId();
	const finalId = useId();
	const delayId = useId();
	const reopenId = useId();
	const ddCountId = useId();
	const [ddDraft, setDdDraft] = useState(String(settings.ddCount));

	useEffect(() => {
		setDdDraft(String(settings.ddCount));
	}, [settings.ddCount]);

	const close = useCallback(() => {
		onFlush();
		setOpen(false);
	}, [onFlush]);

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") close();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, close]);

	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				Settings
			</Button>
			{open &&
				createPortal(
					<>
						<button
							type="button"
							aria-label="Close dialog"
							className="fixed inset-0 z-20 bg-background/90 backdrop-blur"
							onClick={close}
						/>
						<div
							role="dialog"
							aria-modal="true"
							aria-label="Game settings"
							className="fixed inset-0 z-20 overflow-y-auto pointer-events-none"
						>
							<div className="flex min-h-full items-center justify-center p-4">
								<div className="relative bg-card border rounded-2xl p-5 w-full max-w-sm space-y-4 glow-primary pointer-events-auto">
									<h2 className="font-heading font-bold text-lg">
										Game settings
									</h2>

									<label
										htmlFor={manualId}
										className="flex items-center gap-3 text-sm cursor-pointer"
									>
										<input
											id={manualId}
											type="checkbox"
											checked={settings.manualPoints}
											onChange={(e) =>
												onChange({
													...settings,
													manualPoints: e.target.checked,
												})
											}
											className="size-4"
										/>
										<span>
											<span className="block font-medium">
												Manual point assignment
											</span>
											<span className="block text-xs text-muted-foreground">
												Disable automatic scoring. Host assigns points manually
												during gameplay.
											</span>
										</span>
									</label>

									<label
										htmlFor={finalId}
										className="flex items-center gap-3 text-sm cursor-pointer"
									>
										<input
											id={finalId}
											type="checkbox"
											checked={settings.finalEnabled}
											onChange={(e) =>
												onChange({
													...settings,
													finalEnabled: e.target.checked,
												})
											}
											className="size-4"
										/>
										<span>
											<span className="block font-medium">Final Jeopardy</span>
											<span className="block text-xs text-muted-foreground">
												Play a final round after the board is cleared (requires
												a final question on the quiz).
											</span>
										</span>
									</label>

									<label
										htmlFor={reopenId}
										className="flex items-center gap-3 text-sm cursor-pointer"
									>
										<input
											id={reopenId}
											type="checkbox"
											checked={settings.allowReopen}
											onChange={(e) =>
												onChange({ ...settings, allowReopen: e.target.checked })
											}
											className="size-4"
										/>
										<span>
											<span className="block font-medium">
												Allow revisiting answered questions
											</span>
											<span className="block text-xs text-muted-foreground">
												Answered questions stay gray but remain clickable so the
												host can replay them.
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
											value={settings.readDelayMs}
											onChange={(e) =>
												onChange({
													...settings,
													readDelayMs: Number(e.target.value),
												})
											}
											className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
										/>
										<p className="text-xs text-muted-foreground">
											Time before buzzers open after the host opens a question.
										</p>
									</div>

									<div className="space-y-1">
										<label
											htmlFor={ddCountId}
											className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
										>
											Random Daily Doubles
										</label>
										<input
											id={ddCountId}
											type="number"
											min={0}
											max={30}
											step={1}
											value={ddDraft}
											onChange={(e) => {
												setDdDraft(e.target.value);
												const n = Number(e.target.value);
												onChange({
													...settings,
													ddCount:
														e.target.value === ""
															? 0
															: Number.isFinite(n) && n >= 0
																? n
																: settings.ddCount,
												});
											}}
											className="w-full rounded-md border bg-input px-3 py-2 focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
										/>
										<p className="text-xs text-muted-foreground">
											Mark this many extra questions as Daily Doubles at game
											start, picked at random. Added on top of any DDs you've
											authored.
										</p>
									</div>

									<div className="flex justify-end">
										<Button onClick={close}>Done</Button>
									</div>
								</div>
							</div>
						</div>
					</>,
					document.body,
				)}
		</>
	);
}

function HostButton({
	quizId,
	settings,
	finalQuestion,
}: {
	quizId: string;
	settings: GameSettings;
	finalQuestion: FinalQuestion | null;
}) {
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const finalIncomplete =
		settings.finalEnabled &&
		(!finalQuestion?.category.trim() ||
			!finalQuestion.clue.trim() ||
			!finalQuestion.answer.trim());

	async function host() {
		if (finalIncomplete) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(`${apiUrl}/games`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ quizId, options: settings }),
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

	return (
		<>
			<Button
				onClick={host}
				disabled={busy || finalIncomplete}
				title={
					finalIncomplete
						? "Fill in the Final Jeopardy question or turn the setting off."
						: undefined
				}
			>
				{busy ? "Starting…" : "Host game"}
			</Button>
			{finalIncomplete && (
				<span className="text-xs text-muted-foreground">
					Final Jeopardy is on but incomplete.
				</span>
			)}
			{error && <span className="text-xs text-destructive">{error}</span>}
		</>
	);
}
