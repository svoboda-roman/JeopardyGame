import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { cn } from "#/lib/utils";

export type Crumb = { label: string; to?: string };

type PageHeaderProps = {
	title: string;
	description?: string;
	crumbs?: Crumb[];
	actions?: React.ReactNode;
	className?: string;
};

export function PageHeader({
	title,
	description,
	crumbs,
	actions,
	className,
}: PageHeaderProps) {
	return (
		<div className={cn("space-y-3 pb-5 border-b border-border/70", className)}>
			{crumbs && crumbs.length > 0 && (
				<nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
					<ol className="flex flex-wrap items-center gap-1.5">
						{crumbs.map((c, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: breadcrumbs are stable per render
							<Fragment key={`${c.label}-${i}`}>
								{i > 0 && <span aria-hidden>/</span>}
								<li>
									{c.to ? (
										<Link
											// biome-ignore lint/suspicious/noExplicitAny: typed-route to accepts string
											to={c.to as any}
											className="hover:text-foreground transition-colors"
										>
											{c.label}
										</Link>
									) : (
										<span className="text-foreground/80">{c.label}</span>
									)}
								</li>
							</Fragment>
						))}
					</ol>
				</nav>
			)}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
				<div className="space-y-1 min-w-0">
					<h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight truncate">
						{title}
					</h1>
					{description && (
						<p className="text-sm text-muted-foreground">{description}</p>
					)}
				</div>
				{actions && (
					<div className="flex flex-wrap items-center gap-2 sm:flex-nowrap shrink-0">
						{actions}
					</div>
				)}
			</div>
		</div>
	);
}
