import { describe, expect, it } from 'vitest';
import { canLoadDistributionOrder, canTransitionDistributionOrder } from './distribution-workflow';

describe('distribution order workflow', () => {
  it('requires the depot sequence before an order is ready', () => {
    expect(canTransitionDistributionOrder('submitted', 'accepted')).toBe(true);
    expect(canTransitionDistributionOrder('accepted', 'preparing')).toBe(true);
    expect(canTransitionDistributionOrder('preparing', 'ready')).toBe(true);
    expect(canTransitionDistributionOrder('submitted', 'ready')).toBe(false);
    expect(canTransitionDistributionOrder('accepted', 'delivered')).toBe(false);
  });

  it('does not allow a vehicle load before depot preparation is complete', () => {
    expect(canLoadDistributionOrder('submitted')).toBe(false);
    expect(canLoadDistributionOrder('preparing')).toBe(false);
    expect(canLoadDistributionOrder('ready')).toBe(true);
    expect(canLoadDistributionOrder('partially_delivered')).toBe(false);
    expect(canLoadDistributionOrder('delivered')).toBe(false);
    expect(canLoadDistributionOrder('cancelled')).toBe(false);
  });

  it('keeps delivered and cancelled orders terminal', () => {
    expect(canTransitionDistributionOrder('delivered', 'ready')).toBe(false);
    expect(canTransitionDistributionOrder('cancelled', 'submitted')).toBe(false);
    expect(canTransitionDistributionOrder('ready', 'preparing')).toBe(false);
  });
});
