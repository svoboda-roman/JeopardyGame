import { Menu } from "@base-ui/react/menu";
import {
	BookOpen02Icon,
	GameController03Icon,
	Logout03Icon,
	Menu02Icon,
	Settings02Icon,
	UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Link,
	useMatchRoute,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { cn } from "#/lib/utils";
import { useAuth } from "#/stores/auth.ts";

const navItems = [
	{ to: "/quizzes", label: "Quizzes", icon: BookOpen02Icon },
	{ to: "/games", label: "Games", icon: GameController03Icon },
] as const;

function initialsOf(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
	const first = parts[0] ?? "";
	const last = parts[parts.length - 1] ?? "";
	return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

export function AppHeader() {
	const user = useAuth((s) => s.user);
	const signOut = useAuth((s) => s.signOut);
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	async function handleLogout() {
		await signOut();
		navigate({ to: "/login" });
	}

	return (
		<header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
				<Link
					to="/"
					className="wordmark text-lg sm:text-xl tracking-tight"
					aria-label="JeopardyGame home"
				>
					Jeopardy<span className="wordmark-accent">Game</span>
				</Link>

				<nav
					aria-label="Primary"
					className="hidden sm:flex items-center gap-1 ml-4"
				>
					{navItems.map((item) => {
						const active = !!matchRoute({ to: item.to, fuzzy: true });
						return (
							<Link
								key={item.to}
								to={item.to}
								className={cn(
									"relative inline-flex items-center gap-2 px-3 h-9 rounded-full text-sm transition-colors",
									active
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
								)}
							>
								<HugeiconsIcon icon={item.icon} size={16} aria-hidden />
								<span>{item.label}</span>
								{active && (
									<span
										aria-hidden
										className="absolute -bottom-[15px] left-3 right-3 h-0.5 rounded-full bg-primary-bright shadow-[0_0_10px_var(--primary-glow)]"
									/>
								)}
							</Link>
						);
					})}
				</nav>

				<div className="ml-auto flex items-center gap-2">
					{/* Mobile nav menu */}
					<Menu.Root>
						<Menu.Trigger
							aria-label="Open menu"
							className="sm:hidden inline-flex items-center justify-center size-9 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
						>
							<HugeiconsIcon icon={Menu02Icon} size={18} aria-hidden />
						</Menu.Trigger>
						<Menu.Portal>
							<Menu.Positioner sideOffset={8} align="end">
								<Menu.Popup className="min-w-44 rounded-xl border border-border bg-popover text-popover-foreground p-1.5 shadow-lg shadow-black/40 outline-none">
									{navItems.map((item) => (
										<Menu.Item
											key={item.to}
											className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
											onClick={() => navigate({ to: item.to })}
										>
											<HugeiconsIcon icon={item.icon} size={16} aria-hidden />
											<span>{item.label}</span>
										</Menu.Item>
									))}
								</Menu.Popup>
							</Menu.Positioner>
						</Menu.Portal>
					</Menu.Root>

					{user ? (
						<Menu.Root>
							<Menu.Trigger
								aria-label="Account menu"
								className="inline-flex items-center gap-2 h-9 pl-1 pr-2 sm:pr-3 rounded-full border border-border text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
							>
								<span
									aria-hidden
									className="grid place-items-center size-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-[0_0_12px_var(--primary-glow)]"
								>
									{initialsOf(user.name)}
								</span>
								<span className="hidden sm:inline max-w-[10rem] truncate text-foreground/90">
									{user.name}
								</span>
							</Menu.Trigger>
							<Menu.Portal>
								<Menu.Positioner sideOffset={8} align="end">
									<Menu.Popup className="min-w-52 rounded-xl border border-border bg-popover text-popover-foreground p-1.5 shadow-lg shadow-black/40 outline-none">
										<div className="px-2.5 py-2 mb-1 border-b border-border/70">
											<p className="text-sm font-medium truncate">
												{user.name}
											</p>
											<p className="text-xs text-muted-foreground truncate">
												{user.email}
											</p>
										</div>
										<Menu.Item
											className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
											onClick={() => navigate({ to: "/me" })}
										>
											<HugeiconsIcon
												icon={UserCircleIcon}
												size={16}
												aria-hidden
											/>
											<span>Profile</span>
										</Menu.Item>
										<Menu.Item
											className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm cursor-pointer outline-none data-[highlighted]:bg-muted"
											onClick={() => navigate({ to: "/settings" })}
										>
											<HugeiconsIcon
												icon={Settings02Icon}
												size={16}
												aria-hidden
											/>
											<span>Settings</span>
										</Menu.Item>
										<div className="my-1 h-px bg-border/70" />
										<Menu.Item
											className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm cursor-pointer outline-none text-destructive data-[highlighted]:bg-destructive/15"
											onClick={handleLogout}
										>
											<HugeiconsIcon
												icon={Logout03Icon}
												size={16}
												aria-hidden
											/>
											<span>Log out</span>
										</Menu.Item>
									</Menu.Popup>
								</Menu.Positioner>
							</Menu.Portal>
						</Menu.Root>
					) : (
						<Link
							to="/login"
							search={{ next: pathname }}
							className="inline-flex items-center h-9 px-3 rounded-full border border-border text-sm text-foreground hover:bg-muted/50"
						>
							Log in
						</Link>
					)}
				</div>
			</div>
		</header>
	);
}
