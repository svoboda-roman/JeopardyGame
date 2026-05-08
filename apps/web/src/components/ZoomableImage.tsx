import { Cancel01Icon, Maximize02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

export function ZoomableImage({
	src,
	alt = "",
	className,
}: {
	src: string;
	alt?: string;
	className?: string;
}) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = prev;
		};
	}, [open]);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={`group relative inline-block cursor-zoom-in rounded-md ${className ?? ""}`}
				aria-label="Maximize image"
			>
				<img
					src={src}
					alt={alt}
					className="max-h-full max-w-full rounded-md border block"
				/>
				<span className="pointer-events-none absolute top-1.5 right-1.5 rounded-md bg-black/55 text-white p-1 opacity-80 group-hover:opacity-100 transition-opacity">
					<HugeiconsIcon icon={Maximize02Icon} size={14} aria-hidden />
				</span>
			</button>
			{open && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Image preview"
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-150"
				>
					<button
						type="button"
						onClick={() => setOpen(false)}
						aria-label="Close image preview"
						className="absolute inset-0 cursor-zoom-out"
					/>
					<img
						src={src}
						alt={alt}
						className="relative max-h-full max-w-full object-contain rounded-md shadow-2xl pointer-events-none"
					/>
					<button
						type="button"
						onClick={() => setOpen(false)}
						aria-label="Close"
						className="absolute top-3 right-3 rounded-full bg-white/10 hover:bg-white/20 text-white p-2 backdrop-blur"
					>
						<HugeiconsIcon icon={Cancel01Icon} size={20} aria-hidden />
					</button>
				</div>
			)}
		</>
	);
}
