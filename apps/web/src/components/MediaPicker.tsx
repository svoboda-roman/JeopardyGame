import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useRef, useState } from "react";
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
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		setError(null);
		setBusy(true);
		try {
			const next: PickedMedia[] = [...value];
			for (const file of Array.from(files)) {
				if (next.length >= max) {
					setError(`Max ${max} pictures per question`);
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

	function remove(id: string) {
		onChange(value.filter((m) => m.id !== id));
	}

	return (
		<div className="space-y-2">
			{value.length > 0 && (
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
								<HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
							</button>
						</li>
					))}
				</ul>
			)}
			<div className="flex items-center gap-3">
				<label
					htmlFor={inputId}
					className="inline-flex items-center cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
				>
					{busy ? "Uploading…" : "Add picture"}
				</label>
				<input
					id={inputId}
					ref={inputRef}
					type="file"
					accept={ACCEPT}
					multiple
					className="sr-only"
					onChange={(e) => handleFiles(e.target.files)}
					disabled={busy || value.length >= max}
				/>
				<span className="text-xs text-muted-foreground">
					{value.length}/{max}
				</span>
			</div>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}
