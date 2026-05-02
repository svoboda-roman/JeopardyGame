import { useEffect, useMemo, useRef, useState } from "react";
import type {
	ClientToServer,
	ServerToClient,
} from "server/src/game/protocol.ts";
import { createGameStore } from "#/stores/game.ts";

const wsBase = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000";

export type ConnectionStatus =
	| "connecting"
	| "open"
	| "closed"
	| "error"
	| "ended";

export function useGameSocket(roomCode: string) {
	const store = useMemo(() => createGameStore(), []);
	const [status, setStatus] = useState<ConnectionStatus>("connecting");
	const [endReason, setEndReason] = useState<string | null>(null);
	const [endCode, setEndCode] = useState<number | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		let cancelled = false;
		let attempt = 0;
		let timer: ReturnType<typeof setTimeout> | null = null;

		function connect() {
			if (cancelled) return;
			const ws = new WebSocket(`${wsBase}/ws/games/${roomCode}`);
			wsRef.current = ws;
			setStatus("connecting");

			ws.addEventListener("open", () => {
				if (cancelled || wsRef.current !== ws) {
					ws.close();
					return;
				}
				attempt = 0;
				setStatus("open");
			});

			ws.addEventListener("message", (ev) => {
				if (wsRef.current !== ws) return;
				try {
					const msg = JSON.parse(String(ev.data)) as ServerToClient;
					store.getState().apply(msg);
				} catch {
					// ignore malformed
				}
			});

			ws.addEventListener("close", (ev) => {
				// Only react if this ws is still the "current" one. Otherwise this
				// is a stale socket (e.g. closed by StrictMode's double-mount) and
				// we must not clobber refs/status that belong to a newer one.
				if (wsRef.current !== ws) return;
				wsRef.current = null;
				// 44xx codes are terminal application errors from our server
				// (game not found, not a member, bad message). No point retrying.
				if (ev.code >= 4400 && ev.code < 4500) {
					setEndCode(ev.code);
					setEndReason(ev.reason || "Game unavailable");
					setStatus("ended");
					return;
				}
				setStatus("closed");
				if (cancelled) return;
				const delay = Math.min(10_000, 500 * 2 ** attempt++);
				timer = setTimeout(connect, delay);
			});

			ws.addEventListener("error", () => {
				if (wsRef.current !== ws) return;
				setStatus("error");
			});
		}

		connect();

		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
			wsRef.current?.close();
			wsRef.current = null;
		};
	}, [roomCode, store]);

	function send(msg: ClientToServer) {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		ws.send(JSON.stringify(msg));
	}

	return { store, status, endReason, endCode, send };
}
