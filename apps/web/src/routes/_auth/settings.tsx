import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/layout/page-header.tsx";
import { PageShell } from "#/components/layout/page-shell.tsx";
import { useAuth } from "#/stores/auth.ts";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsPage,
});

function SettingsRow({
	label,
	value,
	hint,
	cta,
}: {
	label: string;
	value?: string;
	hint?: string;
	cta?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-4">
			<div className="space-y-0.5 min-w-0">
				<p className="text-sm font-medium">{label}</p>
				{value && (
					<p className="text-sm text-foreground/80 truncate">{value}</p>
				)}
				{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			</div>
			{cta}
		</div>
	);
}

function ComingSoon() {
	return (
		<span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
			Coming soon
		</span>
	);
}

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-2">
			<div className="px-1">
				<h2 className="font-heading text-base font-semibold">{title}</h2>
				{description && (
					<p className="text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			<div className="rounded-2xl border border-border bg-card/60 divide-y divide-border/70">
				{children}
			</div>
		</section>
	);
}

function SettingsPage() {
	const user = useAuth((s) => s.user);
	if (!user) return null;

	return (
		<PageShell width="narrow">
			<PageHeader
				title="Settings"
				description="Manage your account and preferences."
				crumbs={[{ label: "Profile", to: "/me" }, { label: "Settings" }]}
			/>

			<Section title="Profile" description="How you appear in games.">
				<SettingsRow
					label="Display name"
					value={user.name}
					cta={<ComingSoon />}
				/>
				<SettingsRow
					label="Email"
					value={user.email}
					hint={user.emailVerified ? "Verified" : "Not verified yet"}
					cta={<ComingSoon />}
				/>
			</Section>

			<Section title="Security" description="Keep your account safe.">
				<SettingsRow
					label="Change password"
					hint="Set a new password."
					cta={<ComingSoon />}
				/>
			</Section>

			<Section
				title="Account"
				description="Permanent actions. We don't undo these."
			>
				<SettingsRow
					label="Delete account"
					hint="Removes your quizzes and history."
					cta={<ComingSoon />}
				/>
			</Section>
		</PageShell>
	);
}
