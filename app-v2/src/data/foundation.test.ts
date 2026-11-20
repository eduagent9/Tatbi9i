import { describe, expect, it } from 'vitest';
import { validateLegacyDatabase } from './legacy-validation';
import { formatMad, madToMinorUnits, minorUnitsToMad } from './money';

describe('legacy database validation (read-only)', () => {
  it('accepts structurally valid collections and reports counts', () => {
    const report = validateLegacyDatabase({
      products: [{ id: 'p1' }], invoices: [{ id: 'i1' }], people: [],
      expenses: [], movements: [], payments: [{ id: 'pay1', invoiceId: 'i1' }],
      returns: [], purchases: []
    });
    expect(report.valid).toBe(true);
    expect(report.counts.products).toBe(1);
    expect(report.issues).toHaveLength(0);
  });

  it('rejects malformed roots and collection shapes', () => {
    expect(validateLegacyDatabase(null).valid).toBe(false);
    const report = validateLegacyDatabase({ products: {}, invoices: [], people: [], expenses: [], movements: [], payments: [], returns: [], purchases: [] });
    expect(report.issues.some(issue => issue.code === 'COLLECTION_NOT_ARRAY')).toBe(true);
  });

  it('detects duplicate IDs and dangling invoice references', () => {
    const report = validateLegacyDatabase({
      products: [{ id: 1 }, { id: 1 }], invoices: [], people: [], expenses: [], movements: [],
      payments: [{ id: 'pay1', invoiceId: 'missing' }], returns: [], purchases: []
    });
    expect(report.valid).toBe(false);
    expect(report.issues.map(issue => issue.code)).toContain('DUPLICATE_ID');
    expect(report.issues.map(issue => issue.code)).toContain('PAYMENT_INVOICE_MISSING');
  });

  it('does not mutate the supplied legacy object', () => {
    const source = { products: [{ id: 'p1' }], invoices: [], people: [], expenses: [], movements: [], payments: [], returns: [], purchases: [] };
    const before = JSON.stringify(source);
    validateLegacyDatabase(source);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('MAD minor-unit helpers', () => {
  it.each([[0, 0], [1.25, 125], [10.99, 1099], [0.1 + 0.2, 30]])('converts %s MAD to %s centimes', (mad, cents) => {
    expect(madToMinorUnits(mad)).toBe(cents);
    expect(minorUnitsToMad(cents)).toBeCloseTo(Math.round(mad * 100) / 100);
  });

  it('rejects invalid and unsafe amounts', () => {
    expect(() => madToMinorUnits(-1)).toThrow(RangeError);
    expect(() => madToMinorUnits(Number.NaN)).toThrow(RangeError);
    expect(() => minorUnitsToMad(1.5)).toThrow(RangeError);
  });

  it('formats Moroccan dirhams', () => {
    expect(formatMad(12345, 'fr-MA')).toContain('123,45');
  });
});
