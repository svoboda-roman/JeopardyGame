import { useEffect } from "react";
import type {
	DrinkOrderView,
	DrinkView,
	PlayerView,
} from "server/src/game/protocol.ts";
import { iconForDrink } from "#/lib/drink-icons.ts";

const TOAST_MS = 4000;

export function DrinkToast({
	order,
	drinks,
	players,
	selfId,
	onDismiss,
}: {
	order: DrinkOrderView;
	drinks: DrinkView[];
	players: PlayerView[];
	selfId: string | null;
	onDismiss: () => void;
}) {
	useEffect(() => {
		const t = setTimeout(onDismiss, TOAST_MS);
		return () => clearTimeout(t);
	}, [onDismiss]);

	const drink = drinks.find((d) => d.id === order.drinkId);
	const buyer = players.find((p) => p.id === order.buyerId);
	const recipient = players.find((p) => p.id === order.recipientId);
	const me = selfId ? players.find((p) => p.id === selfId) : null;
	if (!drink || !buyer || !recipient) return null;
	// Recipient gets the blocking modal; host gets the persistent queue.
	// Suppress the transient toast for both so it doesn't double-up.
	if (me?.isHost || order.recipientId === selfId) return null;

	const icon = iconForDrink(drink.name);
	const youAreBuyer = order.buyerId === selfId;
	const message = youAreBuyer
		? `${icon} You bought ${recipient.displayName} a ${drink.name}.`
		: `${icon} ${buyer.displayName} bought ${recipient.displayName} a ${drink.name}.`;

	return (
		<div
			role="status"
			aria-live="polite"
			className="fixed top-4 left-1/2 -translate-x-1/2 z-40 max-w-sm rounded-full border px-4 py-2 text-sm font-medium bg-card glow-primary shadow-lg animate-in slide-in-from-top-2 duration-200"
		>
			{message}
		</div>
	);
}
