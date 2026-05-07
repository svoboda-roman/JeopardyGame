import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button.tsx";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/_unauth/verify")({
	validateSearch: (s: Record<string, unknown>): { token?: string } =>
		typeof s.token === "string" ? { token: s.token } : {},
	component: VerifyPage,
});

function VerifyPage() {
	const { token } = Route.useSearch();
	const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");

	useEffect(() => {
		if (!token) {
			setStatus("error");
			return;
		}
		void (async () => {
			const res = await fetch(
				`${apiUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
				{
					credentials: "include",
				},
			);
			setStatus(res.ok ? "ok" : "error");
		})();
	}, [token]);

	if (status === "pending") {
		return (
			<div className="space-y-4 text-center">
				<div
					className="mx-auto size-12 rounded-full border-2 border-primary/30 border-t-primary-bright animate-spin"
					aria-hidden
				/>
				<p className="text-sm text-muted-foreground">Verifying your email…</p>
			</div>
		);
	}

	if (status === "ok") {
		return (
			<div className="space-y-4 text-center">
				<div className="mx-auto grid place-items-center size-14 rounded-full bg-primary/10 text-primary-bright glow-primary">
					<HugeiconsIcon icon={CheckmarkCircle02Icon} size={28} aria-hidden />
				</div>
				<div className="space-y-1.5">
					<h1 className="text-2xl font-bold font-heading">Email verified</h1>
					<p className="text-sm text-muted-foreground">
						Your account is ready. You can now host live games.
					</p>
				</div>
				<Link to="/me">
					<Button size="lg" className="w-full">
						Go to your profile
					</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="space-y-4 text-center">
			<div className="mx-auto grid place-items-center size-14 rounded-full bg-destructive/15 text-destructive">
				<HugeiconsIcon icon={Alert02Icon} size={28} aria-hidden />
			</div>
			<div className="space-y-1.5">
				<h1 className="text-2xl font-bold font-heading">Verification failed</h1>
				<p className="text-sm text-muted-foreground">
					The link is invalid or has expired.
				</p>
			</div>
			<Link
				to="/login"
				className="inline-block text-sm text-primary-bright hover:underline"
			>
				Back to log in
			</Link>
		</div>
	);
}
