import {describe,expect,it} from 'vitest';
import {availableUnreservedQuantity,personalOrderTransitionAllowed} from './personal-orders';

describe('personal order workflow',()=>{
  it('keeps reserved stock out of direct-sale availability',()=>{
    expect(availableUnreservedQuantity(20,7)).toBe(13);
    expect(availableUnreservedQuantity(4,9)).toBe(0);
  });
  it('allows the single-owner preparation and delivery sequence',()=>{
    expect(personalOrderTransitionAllowed('submitted','preparing')).toBe(true);
    expect(personalOrderTransitionAllowed('preparing','ready')).toBe(true);
    expect(personalOrderTransitionAllowed('ready','partially_delivered')).toBe(true);
    expect(personalOrderTransitionAllowed('partially_delivered','delivered')).toBe(true);
    expect(personalOrderTransitionAllowed('submitted','delivered')).toBe(false);
    expect(personalOrderTransitionAllowed('delivered','ready')).toBe(false);
  });
  it('releases a reservation when an order is cancelled',()=>{
    expect(personalOrderTransitionAllowed('submitted','cancelled')).toBe(true);
    expect(personalOrderTransitionAllowed('delivered','cancelled')).toBe(false);
  });
});
