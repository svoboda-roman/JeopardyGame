import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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

	return (
		<div className="space-y-3 text-center">
			{status === "pending" && <p>Verifying your email…</p>}
			{status === "ok" && (
				<>
					<h1 className="text-2xl font-bold">Email verified</h1>
					<p className="text-sm">You can now host games.</p>
					<Link to="/me" className="underline text-sm">
						Go to your profile
					</Link>
				</>
			)}
			{status === "error" && (
				<>
					<h1 className="text-2xl font-bold">Verification failed</h1>
					<p className="text-sm">The link is invalid or has expired.</p>
					<Link to="/login" className="underline text-sm">
						Back to log in
					</Link>
				</>
			)}
		</div>
	);
}
