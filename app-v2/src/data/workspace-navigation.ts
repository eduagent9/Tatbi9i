import type { AppRole } from './permissions';
import type { TranslationKey } from './i18n';

export type WorkspaceNavigationItem = {
  id: string;
  label: string;
  icon: string;
};

type Translate = (key: TranslationKey) => string;

const navigationByRole: Partial<Record<AppRole, ReadonlyArray<readonly [string, TranslationKey, string]>>> = {
  depot_manager: [
    ['role-depot-orders', 'navOrders', '▣'],
    ['role-depot-sales', 'navSales', '＋'],
    ['role-depot-debts', 'navDebts', '◷'],
    ['role-depot-stock', 'navStock', '▤'],
    ['role-depot-cash', 'navCash', '⇄'],
  ],
  van_sales: [
    ['role-van-sales', 'navSales', '＋'],
    ['role-van-cash', 'navCash', '⇄'],
  ],
  delivery_driver: [
    ['role-driver-delivery', 'navDelivery', '⇢'],
    ['role-driver-cash', 'navCash', '⇄'],
  ],
};

export function getWorkspaceNavigation(role: AppRole, translate: Translate): WorkspaceNavigationItem[] {
  return (navigationByRole[role] ?? []).map(([id, key, icon]) => ({
    id,
    label: translate(key),
    icon,
  }));
}
