import type { ReactNode } from "react";

export interface TabItem<K extends string = string> {
	key: K;
	label: ReactNode;
	icon?: ReactNode;
	/** Active bottom-border color class. Defaults to `border-primary`. */
	activeBorderClass?: string;
	/** Background+text classes for the icon badge when this tab is active. */
	iconActiveClass?: string;
}

export function Tabs<K extends string>({
	items,
	value,
	onChange,
	className = "",
}: {
	items: TabItem<K>[];
	value: K;
	onChange: (key: K) => void;
	className?: string;
}) {
	return (
		<div className={`flex border-b border-border ${className}`}>
			{items.map((it) => {
				const active = it.key === value;
				const border = it.activeBorderClass ?? "border-primary";
				const iconActive = it.iconActiveClass ?? "bg-primary/20 text-primary";
				return (
					<button
						key={it.key}
						type="button"
						onClick={() => onChange(it.key)}
						className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
							active
								? `${border} text-foreground`
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						{it.icon && (
							<span
								className={`flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold ${
									active ? iconActive : "bg-muted text-muted-foreground"
								}`}
							>
								{it.icon}
							</span>
						)}
						{it.label}
					</button>
				);
			})}
		</div>
	);
}
