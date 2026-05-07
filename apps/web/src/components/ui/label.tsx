import { cn } from "#/lib/utils";

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: control is supplied by the caller via htmlFor or by wrapping
		<label
			data-slot="label"
			className={cn(
				"text-sm font-medium text-foreground/90 leading-none",
				className,
			)}
			{...props}
		/>
	);
}
