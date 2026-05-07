import { cn } from "#/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
	invalid?: boolean;
};

export function Input({ className, invalid, ...props }: InputProps) {
	return (
		<input
			data-slot="input"
			aria-invalid={invalid || undefined}
			className={cn(
				"flex h-10 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors",
				"focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:border-destructive aria-invalid:ring-destructive/30",
				className,
			)}
			{...props}
		/>
	);
}
