import type {
	ClientToServer,
	DrinkOrderView,
	DrinkView,
	PlayerView,
} from "server/src/game/protocol.ts";
import { Button } from "#/components/ui/button.tsx";
import { iconForDrink } from "#/lib/drink-icons.ts";

/**
 * Host-only persistent panel listing pending drink orders. The host
 * clicks "Drank!" once they see the recipient finish — that releases
 * the recipient's blocking modal.
 */
export function HostDrinkQueue({
	orders,
	drinks,
	players,
	send,
}: {
	orders: DrinkOrderView[];
	drinks: DrinkView[];
	players: PlayerView[];
	send: (msg: ClientToServer) => void;
}) {
	const pending = orders.filter((o) => o.acknowledgedAtMs === null);
	if (pending.length === 0) return null;
	const drinksById = new Map(drinks.map((d) => [d.id, d] as const));
	const playersById = new Map(players.map((p) => [p.id, p] as const));

	return (
		<aside
			aria-label="Pending drinks"
			className="fixed top-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border bg-card/95 backdrop-blur p-3 space-y-2 shadow-xl glow-primary"
		>
			<header className="flex items-center justify-between gap-2">
				<h3 className="font-heading text-sm font-bold">🍻 Pending drinks</h3>
				<span className="text-xs tabular-nums text-muted-foreground bg-input rounded-full px-2 py-0.5">
					{pending.length}
				</span>
			</header>
			<ul className="space-y-1.5 max-h-[60dvh] overflow-y-auto pr-1">
				{pending.map((o) => {
					const drink = drinksById.get(o.drinkId);
					const buyer = playersById.get(o.buyerId);
					const recipient = playersById.get(o.recipientId);
					const icon = iconForDrink(drink?.name ?? "");
					return (
						<li
							key={o.id}
							className="flex items-center gap-2 rounded-lg border bg-input/40 p-2"
						>
							<span className="text-2xl shrink-0" aria-hidden>
								{icon}
							</span>
							<div className="flex-1 min-w-0 text-xs leading-snug">
								<p className="font-semibold text-foreground truncate">
									{drink?.name ?? "Drink"}
									<span className="text-muted-foreground font-normal">
										{" "}
										· {drink?.amount ?? "shot"}
									</span>
								</p>
								<p className="text-muted-foreground truncate">
									<strong className="text-foreground">
										{recipient?.displayName ?? "?"}
									</strong>
									{" ← "}
									{buyer?.displayName ?? "?"}
								</p>
							</div>
							<Button
								size="sm"
								onClick={() =>
									send({ type: "acknowledge_drink", orderId: o.id })
								}
							>
								Drank!
							</Button>
						</li>
					);
				})}
			</ul>
		</aside>
	);
}
