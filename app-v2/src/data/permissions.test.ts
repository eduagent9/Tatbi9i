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
  it('enforces the complete high-risk permission boundary for every staff role', () => {
    const staffRoles = ['depot_manager', 'order_rep', 'van_sales', 'delivery_driver'] as const;
    const ownerOnly: AppPermission[] = ['manage_team', 'view_financial_reports', 'manage_expenses', 'manage_prices', 'void_confirmed_invoice'];
    for (const role of staffRoles) {
      for (const permission of ownerOnly) expect(canPerform(role, permission)).toBe(false);
    }
  });

  it('does not let a role operate another team member\'s workflow', () => {
    expect(canPerform('order_rep', 'prepare_orders')).toBe(false);
    expect(canPerform('order_rep', 'deliver_assigned_orders')).toBe(false);
    expect(canPerform('van_sales', 'deliver_assigned_orders')).toBe(false);
    expect(canPerform('delivery_driver', 'create_vehicle_sales')).toBe(false);
    expect(canPerform('delivery_driver', 'create_depot_sales')).toBe(false);
    expect(canPerform('delivery_driver', 'load_delivery_vehicle')).toBe(false);
  });

  it('keeps cash reconciliation and cash receipt separate from personal handover', () => {
    expect(canPerform('van_sales', 'handover_own_cash')).toBe(true);
    expect(canPerform('van_sales', 'receive_cash_handover')).toBe(false);
    expect(canPerform('van_sales', 'reconcile_cash')).toBe(false);
    expect(canPerform('delivery_driver', 'handover_own_cash')).toBe(true);
    expect(canPerform('delivery_driver', 'receive_cash_handover')).toBe(false);
    expect(canPerform('delivery_driver', 'reconcile_cash')).toBe(false);
  });

  it('keeps order representatives limited to order entry and customer records', () => {
    expect(canPerform('order_rep', 'create_orders')).toBe(true);
    expect(canPerform('order_rep', 'manage_customers')).toBe(true);
    for (const permission of ['manage_products','manage_purchases','adjust_depot_stock','manage_returns','create_depot_sales','collect_customer_debt','manage_vehicles'] as const) {
      expect(canPerform('order_rep', permission)).toBe(false);
    }
  });

  it('keeps depot operations separate from owner administration and sales-van cash', () => {
    expect(canPerform('depot_manager', 'manage_products')).toBe(true);
    expect(canPerform('depot_manager', 'manage_purchases')).toBe(true);
    expect(canPerform('depot_manager', 'prepare_orders')).toBe(true);
    expect(canPerform('depot_manager', 'manage_team')).toBe(false);
    expect(canPerform('depot_manager', 'manage_prices')).toBe(false);
    expect(canPerform('depot_manager', 'collect_vehicle_sales_cash')).toBe(false);
  });

  it('denies every permission when the session role is absent', () => {
    const all: AppPermission[] = [
      'view_dashboard','manage_team','manage_vehicles','manage_products','manage_purchases',
      'adjust_depot_stock','manage_returns','manage_customers','create_orders','create_depot_sales',
      'collect_customer_debt','prepare_orders','load_delivery_vehicle','deliver_assigned_orders',
      'create_vehicle_sales','collect_vehicle_sales_cash','collect_delivery_cash','handover_own_cash',
      'receive_cash_handover','reconcile_cash','view_financial_reports','manage_expenses','manage_prices',
      'void_confirmed_invoice',
    ];
    for (const permission of all) expect(canPerform(undefined, permission)).toBe(false);
  });

});
