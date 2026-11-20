export type DistributionOrderStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'partially_delivered'
  | 'delivered'
  | 'cancelled';

const allowedTransitions: Record<DistributionOrderStatus, readonly DistributionOrderStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: [],
  partially_delivered: [],
  delivered: [],
  cancelled: [],
};

/** Enforce the depot's order-preparation sequence; terminal states cannot be reopened. */
export function canTransitionDistributionOrder(
  current: DistributionOrderStatus,
  next: DistributionOrderStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

/** A delivery vehicle may only be loaded after depot preparation is marked ready. */
export function canLoadDistributionOrder(status: DistributionOrderStatus): boolean {
  return status === 'ready';
}
