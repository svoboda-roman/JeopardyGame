import { BrandHeader } from "#/components/layout/brand-header.tsx";

type UnauthShellProps = {
	children: React.ReactNode;
};

export function UnauthShell({ children }: UnauthShellProps) {
	return (
		<div className="relative min-h-[100dvh] flex flex-col overflow-hidden">
			{/* Faded board watermark */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-2 p-6 opacity-[0.04]"
			>
				{Array.from({ length: 30 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: decorative
					<div key={i} className="rounded-md border border-foreground" />
				))}
			</div>

			<BrandHeader />

			<main className="relative flex-1 flex items-center justify-center px-4 pb-8">
				<div className="w-full max-w-sm border rounded-2xl p-7 bg-card glow-primary">
					{children}
				</div>
			</main>
		</div>
	);
}
