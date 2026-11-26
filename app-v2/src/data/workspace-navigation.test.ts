import { describe, expect, it } from 'vitest';
import { getWorkspaceNavigation } from './workspace-navigation';
import type { TranslationKey } from './i18n';

const translate = (key: TranslationKey) => key;

describe('getWorkspaceNavigation', () => {
  it('provides depot navigation for the depot manager only', () => {
    expect(getWorkspaceNavigation('depot_manager', translate).map(item => item.id)).toEqual([
      'role-depot-orders', 'role-depot-sales', 'role-depot-debts', 'role-depot-stock', 'role-depot-cash',
    ]);
  });

  it('provides sales and cash navigation for van sales', () => {
    expect(getWorkspaceNavigation('van_sales', translate).map(item => item.id)).toEqual([
      'role-van-sales', 'role-van-cash',
    ]);
  });

  it('provides delivery and cash navigation for drivers', () => {
    expect(getWorkspaceNavigation('delivery_driver', translate).map(item => item.id)).toEqual([
      'role-driver-delivery', 'role-driver-cash',
    ]);
  });

  it('does not expose owner or order-representative sections through this dock', () => {
    expect(getWorkspaceNavigation('owner', translate)).toEqual([]);
    expect(getWorkspaceNavigation('order_rep', translate)).toEqual([]);
  });

  it('translates labels through the active application language', () => {
    expect(getWorkspaceNavigation('van_sales', key => 'fr:' + key)[0].label).toBe('fr:navSales');
  });
});
