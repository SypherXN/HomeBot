import type { IconName } from "../components/icons";

/** Pages the user can hide from navigation. Home, Settings, and auth routes stay available. */
export type NavPageId = "buy" | "wishlist" | "meals" | "money" | "budget" | "calendar";

export type NavPageConfig = {
  id: NavPageId;
  to: string;
  label: string;
  icon: IconName;
  group: string;
  description: string;
  /** Shown on the mobile bottom tab bar when visible. */
  mobileTab?: boolean;
};

export const TOGGLEABLE_NAV_PAGES: NavPageConfig[] = [
  {
    id: "buy",
    to: "/buy",
    label: "Buy",
    icon: "buy",
    group: "Household",
    description: "Shared shopping list",
    mobileTab: true,
  },
  {
    id: "wishlist",
    to: "/wishlist",
    label: "Wishlist",
    icon: "wishlist",
    group: "Household",
    description: "Gift ideas and wants",
  },
  {
    id: "meals",
    to: "/meals",
    label: "Meals",
    icon: "meals",
    group: "Household",
    description: "Meal planning and recipes",
  },
  {
    id: "money",
    to: "/money",
    label: "Money",
    icon: "money",
    group: "Finances",
    description: "IOUs and balances between people",
  },
  {
    id: "budget",
    to: "/budget",
    label: "Budget",
    icon: "budget",
    group: "Finances",
    description: "Household budget and accounts",
    mobileTab: true,
  },
  {
    id: "calendar",
    to: "/calendar",
    label: "Calendar",
    icon: "calendar",
    group: "Planning",
    description: "Events, tasks, and schedules",
    mobileTab: true,
  },
];

export type ShellNavItem = {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  pageId?: NavPageId;
};

export const HOME_NAV_ITEM: ShellNavItem = { to: "/", label: "Home", icon: "home", end: true };
export const SETTINGS_NAV_ITEM: ShellNavItem = { to: "/settings", label: "Settings", icon: "settings" };

const pageById = new Map(TOGGLEABLE_NAV_PAGES.map((p) => [p.id, p]));

export function navPageById(id: NavPageId): NavPageConfig {
  const page = pageById.get(id);
  if (!page) throw new Error(`Unknown nav page: ${id}`);
  return page;
}

export function isNavPageHidden(hidden: ReadonlySet<NavPageId>, id: NavPageId): boolean {
  return hidden.has(id);
}

export function isNavPathHidden(hidden: ReadonlySet<NavPageId>, pathname: string): boolean {
  const id = navPageIdForPath(pathname);
  return id != null && isNavPageHidden(hidden, id);
}

export function navPageIdForPath(pathname: string): NavPageId | null {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/budget" || path.startsWith("/budget/")) return "budget";
  for (const page of TOGGLEABLE_NAV_PAGES) {
    if (path === page.to) return page.id;
  }
  return null;
}

function toShellItem(page: NavPageConfig): ShellNavItem {
  return { to: page.to, label: page.label, icon: page.icon, pageId: page.id };
}

export function buildNavGroups(hidden: ReadonlySet<NavPageId>): { label: string | null; items: ShellNavItem[] }[] {
  const visible = TOGGLEABLE_NAV_PAGES.filter((p) => !isNavPageHidden(hidden, p.id)).map(toShellItem);
  const byGroup = new Map<string, ShellNavItem[]>();
  for (const item of visible) {
    const page = pageById.get(item.pageId!);
    const group = page?.group ?? "Other";
    const list = byGroup.get(group) ?? [];
    list.push(item);
    byGroup.set(group, list);
  }

  const groups: { label: string | null; items: ShellNavItem[] }[] = [
    { label: null, items: [HOME_NAV_ITEM] },
  ];

  for (const label of ["Household", "Finances", "Planning"]) {
    const items = byGroup.get(label);
    if (items?.length) groups.push({ label, items });
  }

  groups.push({ label: "System", items: [SETTINGS_NAV_ITEM] });
  return groups;
}

export function buildMobileTabItems(hidden: ReadonlySet<NavPageId>): ShellNavItem[] {
  const tabs: ShellNavItem[] = [HOME_NAV_ITEM];
  for (const page of TOGGLEABLE_NAV_PAGES) {
    if (!page.mobileTab || isNavPageHidden(hidden, page.id)) continue;
    tabs.push(toShellItem(page));
  }
  return tabs;
}

export function buildMoreItems(hidden: ReadonlySet<NavPageId>, tabItems: ShellNavItem[]): ShellNavItem[] {
  const tabPaths = new Set(tabItems.map((i) => i.to));
  const flat = buildNavGroups(hidden).flatMap((g) => g.items);
  return flat.filter((i) => !tabPaths.has(i.to) && i.to !== "/");
}

export const KEYBOARD_SHORTCUTS: Partial<Record<NavPageId, string>> = {
  buy: "b",
  wishlist: "w",
  money: "m",
  calendar: "c",
};
