import { describe, expect, it } from 'vitest';
import { canCollectDeliveryCash, canPerform, type AppPermission } from './permissions';

describe('role permission policy', () => {
  it('grants the owner all permissions', () => {
    const all: AppPermission[] = [
      'view_dashboard','manage_team','manage_vehicles','manage_products','manage_purchases',
      'adjust_depot_stock','manage_returns','manage_customers','create_orders','create_depot_sales','collect_customer_debt','prepare_orders',
      'load_delivery_vehicle','deliver_assigned_orders','create_vehicle_sales',
      'collect_vehicle_sales_cash','collect_delivery_cash','handover_own_cash',
      'receive_cash_handover','reconcile_cash','view_financial_reports','manage_expenses',
      'manage_prices','void_confirmed_invoice',
    ];
    for (const permission of all) expect(canPerform('owner', permission)).toBe(true);
  });

  it('keeps order representatives from changing prices or confirmed invoices', () => {
    expect(canPerform('order_rep', 'create_orders')).toBe(true);
    expect(canPerform('order_rep', 'manage_prices')).toBe(false);
    expect(canPerform('order_rep', 'void_confirmed_invoice')).toBe(false);
    expect(canPerform('order_rep', 'view_financial_reports')).toBe(false);
  });

  it('limits drivers to delivery and their own cash handover', () => {
    expect(canPerform('delivery_driver', 'deliver_assigned_orders')).toBe(true);
    expect(canPerform('delivery_driver', 'handover_own_cash')).toBe(true);
    expect(canPerform('delivery_driver', 'manage_purchases')).toBe(false);
    expect(canPerform('delivery_driver', 'reconcile_cash')).toBe(false);
  });

  it('limits van sales to their vehicle sales and collections', () => {
    expect(canPerform('van_sales', 'create_vehicle_sales')).toBe(true);
    expect(canPerform('van_sales', 'collect_vehicle_sales_cash')).toBe(true);
    expect(canPerform('van_sales', 'manage_prices')).toBe(false);
    expect(canPerform('van_sales', 'void_confirmed_invoice')).toBe(false);
  });

  it('allows depot managers to prepare stock and reconcile cash, not manage staff', () => {
    expect(canPerform('depot_manager', 'prepare_orders')).toBe(true);
    expect(canPerform('depot_manager', 'reconcile_cash')).toBe(true);
    expect(canPerform('depot_manager', 'create_depot_sales')).toBe(true);
    expect(canPerform('depot_manager', 'collect_customer_debt')).toBe(true);
    expect(canPerform('depot_manager', 'manage_team')).toBe(false);
  });

  it('denies missing roles and permits cash collection only for delivery vehicles', () => {
    expect(canPerform(null, 'create_orders')).toBe(false);
    expect(canCollectDeliveryCash('delivery')).toBe(true);
    expect(canCollectDeliveryCash(undefined)).toBe(false);
  });
});
