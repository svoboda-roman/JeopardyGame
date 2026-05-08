import type {
	DrinkOrderView,
	DrinkView,
	PlayerView,
} from "server/src/game/protocol.ts";
import { iconForDrink } from "#/lib/drink-icons.ts";

/**
 * Fullscreen blocker shown to the recipient until the host marks each
 * pending drink as drunk. Doesn't dismiss on its own.
 */
export function PendingDrinkModal({
	orders,
	drinks,
	players,
}: {
	orders: DrinkOrderView[];
	drinks: DrinkView[];
	players: PlayerView[];
}) {
	if (orders.length === 0) return null;
	const drinksById = new Map(drinks.map((d) => [d.id, d] as const));
	const playersById = new Map(players.map((p) => [p.id, p] as const));
	const head = orders[0];
	if (!head) return null;
	const drink = drinksById.get(head.drinkId);
	const buyer = playersById.get(head.buyerId);
	const icon = iconForDrink(drink?.name ?? "");

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/95 backdrop-blur">
			<div className="relative w-full max-w-sm rounded-2xl border bg-card p-6 text-center space-y-4 glow-primary shadow-[0_0_60px_var(--primary-glow)]">
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--gold)]">
					{orders.length > 1
						? `Drink ${1} of ${orders.length}`
						: "You owe a drink!"}
				</p>
				<div className="text-7xl leading-none" aria-hidden>
					{icon}
				</div>
				<div>
					<p className="font-heading font-bold text-2xl">
						{drink?.name ?? "Drink"}
					</p>
					<p className="text-sm text-muted-foreground uppercase tracking-wider">
						{drink?.amount ?? "shot"}
						{drink?.price ? ` · ${drink.price}` : ""}
					</p>
				</div>
				<p className="text-base">
					From <strong>{buyer?.displayName ?? "someone"}</strong>
				</p>
				<p className="text-xs text-muted-foreground">
					Drink up — waiting for the host to confirm.
				</p>
				{orders.length > 1 && (
					<ul className="text-left text-xs text-muted-foreground space-y-0.5 pt-2 border-t border-border">
						{orders.slice(1).map((o) => {
							const d = drinksById.get(o.drinkId);
							const b = playersById.get(o.buyerId);
							return (
								<li key={o.id} className="flex justify-between gap-2">
									<span className="truncate">
										{iconForDrink(d?.name ?? "")} {d?.name ?? "Drink"}
									</span>
									<span>from {b?.displayName ?? "?"}</span>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
