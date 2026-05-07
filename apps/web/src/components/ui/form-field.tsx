import { useId } from "react";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { cn } from "#/lib/utils";

type FormFieldProps = Omit<
	React.InputHTMLAttributes<HTMLInputElement>,
	"id"
> & {
	label: string;
	helper?: string;
	error?: string | null;
	id?: string;
	containerClassName?: string;
};

export function FormField({
	label,
	helper,
	error,
	id,
	containerClassName,
	className,
	...inputProps
}: FormFieldProps) {
	const reactId = useId();
	const inputId = id ?? reactId;
	const helperId = helper ? `${inputId}-help` : undefined;
	const errorId = error ? `${inputId}-error` : undefined;
	const describedBy =
		[helperId, errorId].filter(Boolean).join(" ") || undefined;

	return (
		<div className={cn("space-y-1.5", containerClassName)}>
			<Label htmlFor={inputId}>{label}</Label>
			<Input
				id={inputId}
				invalid={!!error}
				aria-describedby={describedBy}
				className={className}
				{...inputProps}
			/>
			{helper && !error && (
				<p id={helperId} className="text-xs text-muted-foreground">
					{helper}
				</p>
			)}
			{error && (
				<p id={errorId} className="text-xs text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}
