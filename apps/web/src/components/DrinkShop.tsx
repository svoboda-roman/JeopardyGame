import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
	ClientToServer,
	DrinkOrderView,
	DrinkView,
	GameView,
	PlayerView,
} from "server/src/game/protocol.ts";
import { Button } from "#/components/ui/button.tsx";
import { iconForDrink } from "#/lib/drink-icons.ts";

export function DrinkShopButton({
	game,
	selfId,
	send,
}: {
	game: GameView;
	selfId: string | null;
	send: (msg: ClientToServer) => void;
}) {
	const [open, setOpen] = useState(false);
	if (game.phase === "lobby") return null;
	const drinks = game.drinks ?? [];
	const orders = game.drinkOrders ?? [];

	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				🍻 Shop
				{drinks.length > 0 && (
					<span className="ml-1 text-xs text-muted-foreground tabular-nums">
						({drinks.length})
					</span>
				)}
			</Button>
			{open && (
				<DrinkShopModal
					game={game}
					selfId={selfId}
					drinks={drinks}
					orders={orders}
					onBuy={(recipientId, drinkId) =>
						send({ type: "buy_drink", recipientId, drinkId })
					}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

function DrinkShopModal({
	game,
	selfId,
	drinks,
	orders,
	onBuy,
	onClose,
}: {
	game: GameView;
	selfId: string | null;
	drinks: DrinkView[];
	orders: DrinkOrderView[];
	onBuy: (recipientId: string, drinkId: string) => void;
	onClose: () => void;
}) {
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const recipients = game.players.filter(
		(p) => p.status !== "left" && p.status !== "kicked" && p.id !== selfId,
	);
	const playersById = new Map(game.players.map((p) => [p.id, p] as const));
	const drinksById = new Map(drinks.map((d) => [d.id, d] as const));

	return createPortal(
		<>
			<button
				type="button"
				aria-label="Close shop"
				className="fixed inset-0 z-30 bg-background/90 backdrop-blur"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Drink shop"
				className="fixed inset-0 z-30 overflow-y-auto pointer-events-none"
			>
				<div className="flex min-h-full items-center justify-center p-4">
					<div className="relative bg-card border rounded-2xl p-5 w-full max-w-md space-y-4 glow-primary pointer-events-auto">
						<div className="flex items-center justify-between">
							<h2 className="font-heading font-bold text-lg">🍻 Drink shop</h2>
							<button
								type="button"
								onClick={onClose}
								className="text-muted-foreground hover:text-foreground text-sm"
							>
								Close
							</button>
						</div>

						{drinks.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4 text-center">
								The host hasn't stocked any drinks for this quiz.
							</p>
						) : recipients.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4 text-center">
								Nobody to buy for yet — wait for players to join.
							</p>
						) : (
							<div className="space-y-2">
								{drinks.map((d) => (
									<DrinkRow
										key={d.id}
										drink={d}
										recipients={recipients}
										onBuy={(rid) => onBuy(rid, d.id)}
									/>
								))}
							</div>
						)}

						{orders.length > 0 && (
							<div className="border-t border-border pt-3 space-y-2">
								<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Bar tab
								</h3>
								<TabSummary
									orders={orders}
									playersById={playersById}
									drinksById={drinksById}
								/>
							</div>
						)}
					</div>
				</div>
			</div>
		</>,
		document.body,
	);
}

function DrinkRow({
	drink,
	recipients,
	onBuy,
}: {
	drink: DrinkView;
	recipients: PlayerView[];
	onBuy: (recipientId: string) => void;
}) {
	const [target, setTarget] = useState<string>(recipients[0]?.id ?? "");
	const icon = iconForDrink(drink.name);
	return (
		<div className="flex items-center gap-2 rounded-lg border bg-input/30 px-3 py-2">
			<span className="text-2xl shrink-0" aria-hidden>
				{icon}
			</span>
			<div className="flex-1 min-w-0">
				<p className="font-medium text-sm truncate">
					{drink.name || "Unnamed drink"}
				</p>
				<p className="text-xs text-muted-foreground">
					<span className="uppercase tracking-wider">{drink.amount}</span>
					{drink.price > 0 && <> · {drink.price}</>}
				</p>
			</div>
			<select
				value={target}
				onChange={(e) => setTarget(e.target.value)}
				className="rounded-md border bg-input px-2 py-1 text-xs max-w-[8rem]"
			>
				{recipients.map((p) => (
					<option key={p.id} value={p.id}>
						{p.displayName}
						{p.isHost ? " (host)" : ""}
					</option>
				))}
			</select>
			<Button
				size="sm"
				disabled={!target}
				onClick={() => target && onBuy(target)}
			>
				Buy
			</Button>
		</div>
	);
}

function TabSummary({
	orders,
	playersById,
	drinksById,
}: {
	orders: DrinkOrderView[];
	playersById: Map<string, PlayerView>;
	drinksById: Map<string, DrinkView>;
}) {
	// Aggregate per buyer→recipient pair: count + total price.
	const pairs = new Map<
		string,
		{ buyerId: string; recipientId: string; count: number; total: number }
	>();
	for (const o of orders) {
		const drink = drinksById.get(o.drinkId);
		if (!drink) continue;
		const k = `${o.buyerId}>${o.recipientId}`;
		const cur = pairs.get(k) ?? {
			buyerId: o.buyerId,
			recipientId: o.recipientId,
			count: 0,
			total: 0,
		};
		cur.count += 1;
		cur.total += drink.price;
		pairs.set(k, cur);
	}
	const rows = [...pairs.values()].sort((a, b) => b.total - a.total);

	return (
		<ul className="space-y-1 text-xs">
			{rows.map((r) => {
				const buyer = playersById.get(r.buyerId)?.displayName ?? "?";
				const recipient = playersById.get(r.recipientId)?.displayName ?? "?";
				return (
					<li
						key={`${r.buyerId}>${r.recipientId}`}
						className="flex items-center justify-between gap-3 rounded-md border bg-background/40 px-2 py-1"
					>
						<span className="truncate">
							<strong className="text-foreground">{buyer}</strong> → {recipient}
						</span>
						<span className="font-mono tabular-nums text-muted-foreground">
							{r.count}× · {r.total}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
