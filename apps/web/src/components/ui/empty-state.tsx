import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import { cn } from "#/lib/utils";

type EmptyStateProps = {
	icon: ComponentProps<typeof HugeiconsIcon>["icon"];
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
};

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center text-center gap-4 rounded-2xl border border-border bg-card/40 px-6 py-12 sm:py-16",
				className,
			)}
		>
			<div className="grid place-items-center size-14 sm:size-16 rounded-full bg-primary/10 text-primary-bright glow-primary">
				<HugeiconsIcon icon={icon} size={32} strokeWidth={1.6} aria-hidden />
			</div>
			<div className="space-y-1.5 max-w-sm">
				<h2 className="font-heading text-lg sm:text-xl font-semibold">
					{title}
				</h2>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{action && <div className="pt-1">{action}</div>}
		</div>
	);
}
