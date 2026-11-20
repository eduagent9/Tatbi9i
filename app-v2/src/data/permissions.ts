export type AppRole = 'owner' | 'depot_manager' | 'order_rep' | 'van_sales' | 'delivery_driver';

export type AppPermission =
  | 'view_dashboard'
  | 'manage_team'
  | 'manage_vehicles'
  | 'manage_products'
  | 'manage_purchases'
  | 'adjust_depot_stock'
  | 'manage_returns'
  | 'manage_customers'
  | 'create_orders'
  | 'prepare_orders'
  | 'load_delivery_vehicle'
  | 'deliver_assigned_orders'
  | 'create_vehicle_sales'
  | 'collect_vehicle_sales_cash'
  | 'collect_delivery_cash'
  | 'handover_own_cash'
  | 'receive_cash_handover'
  | 'reconcile_cash'
  | 'view_financial_reports'
  | 'manage_expenses'
  | 'manage_prices'
  | 'void_confirmed_invoice';

const permissions: Record<Exclude<AppRole, 'owner'>, readonly AppPermission[]> = {
  depot_manager: [
    'view_dashboard', 'manage_vehicles', 'manage_products', 'manage_purchases',
    'adjust_depot_stock', 'manage_returns', 'manage_customers', 'prepare_orders',
    'load_delivery_vehicle', 'receive_cash_handover', 'reconcile_cash',
  ],
  order_rep: ['create_orders', 'manage_customers'],
  van_sales: [
    'view_dashboard', 'manage_customers', 'create_vehicle_sales',
    'collect_vehicle_sales_cash', 'handover_own_cash',
  ],
  delivery_driver: [
    'view_dashboard', 'deliver_assigned_orders', 'collect_delivery_cash',
    'handover_own_cash',
  ],
};

/** Central role policy. Owner is the only role with unrestricted application access. */
export function canPerform(role: AppRole | null | undefined, permission: AppPermission): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  return permissions[role]?.includes(permission) ?? false;
}

/** Motorcycle deliveries are cashless; only delivery vans may collect delivery payments. */
export function canCollectDeliveryCash(vehicleType: 'delivery' | 'motorcycle' | null | undefined): boolean {
  return vehicleType === 'delivery';
}
