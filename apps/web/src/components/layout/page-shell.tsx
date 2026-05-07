import { cn } from "#/lib/utils";

type PageShellProps = {
	children: React.ReactNode;
	width?: "narrow" | "default" | "wide";
	className?: string;
};

const widthClasses = {
	narrow: "max-w-2xl",
	default: "max-w-4xl",
	wide: "max-w-6xl",
} as const;

export function PageShell({
	children,
	width = "default",
	className,
}: PageShellProps) {
	return (
		<div
			className={cn(
				"mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6",
				widthClasses[width],
				className,
			)}
		>
			{children}
		</div>
	);
}
