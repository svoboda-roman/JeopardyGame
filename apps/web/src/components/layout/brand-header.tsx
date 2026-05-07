import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

export function BrandHeader() {
	return (
		<header className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
			<Link
				to="/"
				className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<HugeiconsIcon icon={ArrowLeft01Icon} size={16} aria-hidden />
				<span>Home</span>
			</Link>
			<Link
				to="/"
				className="wordmark text-xl sm:text-2xl tracking-tight"
				aria-label="JeopardyGame home"
			>
				Jeopardy<span className="wordmark-accent">Game</span>
			</Link>
			<span className="w-12" aria-hidden />
		</header>
	);
}
