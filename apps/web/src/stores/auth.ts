import { create } from "zustand";
import { api } from "#/lib/api.ts";

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image: string | null;
}

interface AuthState {
	user: AuthUser | null;
	loading: boolean;
	initialized: boolean;
	refresh: () => Promise<void>;
	signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
	user: null,
	loading: false,
	initialized: false,

	async refresh() {
		set({ loading: true });
		const { data, error } = await api.me.get();
		if (error || !data || "error" in data) {
			set({ user: null, loading: false, initialized: true });
			return;
		}
		const user = (data as { user: AuthUser }).user;
		set({ user, loading: false, initialized: true });
	},

	async signOut() {
		await fetch(
			`${import.meta.env.VITE_API_URL ?? "http://localhost:3000"}/api/auth/sign-out`,
			{
				method: "POST",
				credentials: "include",
			},
		);
		set({ user: null });
	},
}));

export async function ensureAuthLoaded(): Promise<AuthUser | null> {
	const s = useAuth.getState();
	if (!s.initialized) await s.refresh();
	return useAuth.getState().user;
}
