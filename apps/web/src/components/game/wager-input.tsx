import { useId, useState } from "react";
import { Button } from "#/components/ui/button.tsx";

export function WagerInput({
	min,
	max,
	label,
	submitLabel,
	onSubmit,
}: {
	min: number;
	max: number;
	label: string;
	submitLabel: string;
	onSubmit: (amount: number) => void;
}) {
	const [value, setValue] = useState<string>(String(min));
	const [submitted, setSubmitted] = useState(false);
	const inputId = useId();

	const num = Number(value);
	const valid = Number.isInteger(num) && num >= min && num <= max;

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!valid || submitted) return;
		setSubmitted(true);
		onSubmit(num);
	}

	if (submitted) {
		return (
			<p className="text-center text-sm text-muted-foreground">
				Wager submitted: <span className="score">${num}</span>
			</p>
		);
	}

	return (
		<form onSubmit={submit} className="space-y-2">
			<label
				htmlFor={inputId}
				className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
			>
				{label}{" "}
				<span className="text-foreground">
					(${min} – ${max})
				</span>
			</label>
			<div className="flex gap-2">
				<input
					id={inputId}
					type="number"
					inputMode="numeric"
					min={min}
					max={max}
					step={1}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					className="flex-1 rounded-md border bg-input px-3 py-2 score text-xl text-right focus:outline-none focus:border-primary focus:ring-3 focus:ring-ring/40"
				/>
				<Button type="submit" variant="gold" disabled={!valid}>
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}
