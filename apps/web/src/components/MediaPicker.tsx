import {
	Add01Icon,
	Delete02Icon,
	Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { apiUrl } from "#/lib/api.ts";

export interface PickedMedia {
	id: string;
	mime: string;
	url: string;
}

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const MAX_BYTES = 5 * 1024 * 1024;

export function MediaPicker({
	value,
	onChange,
	max = 6,
}: {
	value: PickedMedia[];
	onChange: (next: PickedMedia[]) => void;
	max?: number;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const zoneRef = useRef<HTMLDivElement>(null);
	const buttonZoneRef = useRef<HTMLButtonElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const full = value.length >= max;

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		setError(null);
		setBusy(true);
		try {
			const next: PickedMedia[] = [...value];
			for (const file of Array.from(files)) {
				if (next.length >= max) {
					setError(`Max ${max} pictures`);
					break;
				}
				if (file.size > MAX_BYTES) {
					setError(`${file.name} exceeds 5 MB`);
					continue;
				}
				const fd = new FormData();
				fd.append("file", file);
				const res = await fetch(`${apiUrl("/media")}`, {
					method: "POST",
					credentials: "include",
					body: fd,
				});
				if (!res.ok) {
					setError(`Upload failed: ${res.status}`);
					continue;
				}
				const body = (await res.json()) as { media: PickedMedia };
				next.push(body.media);
			}
			onChange(next);
		} finally {
			setBusy(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	// Refs always point to the latest values so the paste effect never goes stale.
	const busyRef = useRef(busy);
	busyRef.current = busy;
	const fullRef = useRef(full);
	fullRef.current = full;
	const handleFilesRef = useRef(handleFiles);
	handleFilesRef.current = handleFiles;

	// Paste: document-level, fires when no text input is focused.
	// Only one picker is mounted at a time (question/answer tabs), so no ambiguity.
	useEffect(() => {
		async function onDocumentPaste(e: ClipboardEvent) {
			const active = document.activeElement;
			const isTyping =
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement;
			if (isTyping) return;
			if (busyRef.current || fullRef.current) return;
			const item = Array.from(e.clipboardData?.items ?? []).find(
				(i) => i.kind === "file" && i.type.startsWith("image/"),
			);
			if (!item) return;
			e.preventDefault();
			const blob = item.getAsFile();
			if (!blob) return;
			const ext = blob.type.split("/")[1] ?? "png";
			const file = new File([blob], `paste-${Date.now()}.${ext}`, {
				type: blob.type,
			});
			const dt = new DataTransfer();
			dt.items.add(file);
			await handleFilesRef.current(dt.files);
		}
		document.addEventListener("paste", onDocumentPaste);
		return () => document.removeEventListener("paste", onDocumentPaste);
	}, []); // stable — reads latest state via refs

	function remove(id: string) {
		onChange(value.filter((m) => m.id !== id));
	}

	function onDragOver(e: React.DragEvent) {
		e.preventDefault();
		if (!full && !busy) setDragging(true);
	}

	function onDragLeave(e: React.DragEvent) {
		const zone = zoneRef.current ?? buttonZoneRef.current;
		if (!zone?.contains(e.relatedTarget as Node)) setDragging(false);
	}

	function onDrop(e: React.DragEvent) {
		e.preventDefault();
		setDragging(false);
		if (!full && !busy) handleFiles(e.dataTransfer.files);
	}

	const hasImages = value.length > 0;

	return (
		<div className="space-y-3">
			{hasImages ? (
				/* Compact mode: thumbnails + "+" button, whole area accepts drag & drop */
				<fieldset
					ref={zoneRef as unknown as React.RefObject<HTMLFieldSetElement>}
					onDragOver={onDragOver}
					onDragLeave={onDragLeave}
					onDrop={onDrop}
					className={`rounded-xl border-2 border-dashed p-3 transition-colors ${
						dragging ? "border-primary bg-primary/5" : "border-border"
					}`}
				>
					<ul className="flex flex-wrap gap-2">
						{value.map((m) => (
							<li key={m.id} className="relative">
								<img
									src={apiUrl(m.url)}
									alt=""
									className="h-20 w-20 object-cover rounded-md border"
								/>
								<button
									type="button"
									aria-label="Remove picture"
									onClick={() => remove(m.id)}
									className="absolute -top-2 -right-2 rounded-full bg-background border p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
								>
									<HugeiconsIcon
										icon={Delete02Icon}
										size={14}
										strokeWidth={2}
									/>
								</button>
							</li>
						))}
						{!full && (
							<li>
								<button
									type="button"
									aria-label="Add picture"
									onClick={() => !busy && inputRef.current?.click()}
									disabled={busy}
									className="h-20 w-20 flex items-center justify-center rounded-md border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/20 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{busy ? (
										<span className="text-xs">…</span>
									) : (
										<HugeiconsIcon
											icon={Add01Icon}
											size={20}
											strokeWidth={1.5}
										/>
									)}
								</button>
							</li>
						)}
					</ul>
				</fieldset>
			) : (
				/* Empty state: full dropzone */
				<button
					ref={buttonZoneRef}
					type="button"
					disabled={busy}
					aria-label="Upload image — drag, paste, or click to browse"
					onClick={() => inputRef.current?.click()}
					onDragOver={onDragOver}
					onDragLeave={onDragLeave}
					onDrop={onDrop}
					className={`relative flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors outline-none
						focus-visible:border-primary focus-visible:bg-primary/5
						${dragging ? "border-primary bg-primary/5" : busy ? "border-border opacity-50 cursor-not-allowed" : "border-border hover:border-primary/50 hover:bg-muted/20 cursor-pointer"}`}
				>
					<div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted border border-border">
						<HugeiconsIcon
							icon={Upload01Icon}
							size={22}
							strokeWidth={1.5}
							className="text-muted-foreground"
						/>
					</div>
					{busy ? (
						<p className="text-sm font-medium text-muted-foreground">
							Uploading…
						</p>
					) : (
						<>
							<p className="text-sm font-medium text-foreground">
								Upload an image
							</p>
							<p className="text-sm text-muted-foreground">
								or,{" "}
								<span className="font-semibold text-foreground underline underline-offset-2 decoration-dotted">
									click to browse
								</span>{" "}
								<span className="text-xs">(5 MB max)</span>
							</p>
							<p className="text-xs text-muted-foreground/60">
								Also supports drag & drop · Ctrl+V to paste
							</p>
						</>
					)}
				</button>
			)}

			<input
				ref={inputRef}
				type="file"
				accept={ACCEPT}
				multiple
				className="sr-only"
				onChange={(e) => handleFiles(e.target.files)}
				disabled={busy || full}
			/>

			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}
