import { describe, expect, it } from 'vitest';
import { buildLegacyDryRun } from './legacy-dry-run';

describe('legacy dry-run reconciliation', () => {
  it('summarizes observed legacy fields without modifying input', () => {
    const old = {
      products: [{id:1,qty:2.5,image:'data:image/png;base64,AA=='},{id:2,qty:3}],
      invoices: [{id:10,total:30,paid:10,due:20,items:[{total:30}]}],
      people: [], expenses: [], movements: [], payments: [{id:1,invoiceId:10,amount:10}],
      returns: [{id:1,invoiceId:10,amount:2}],
      purchases: [{id:1,total:50,paid:20,due:30}]
    };
    const before=JSON.stringify(old);
    const report=buildLegacyDryRun(old);
    expect(report.counts.invoices).toBe(1);
    expect(report.totals.productQuantity).toBe(5.5);
    expect(report.totals.invoiceDue).toBe(20);
    expect(report.totals.paymentAmount).toBe(10);
    expect(report.totals.purchaseDue).toBe(30);
    expect(report.imageCount).toBe(1);
    expect(report.flags).toHaveLength(0);
    expect(JSON.stringify(old)).toBe(before);
  });

  it('reports invoice mismatch and dangling payment/return references', () => {
    const report=buildLegacyDryRun({
      products: [], invoices: [{id:'a',total:100,items:[{total:80}]}],
      payments: [{invoiceId:'missing',amount:4}],
      returns: [{invoiceId:'missing',amount:2}]
    });
    expect(report.invoiceLineMismatches[0].difference).toBe(20);
    expect(report.flags.map(x=>x.code)).toContain('PAYMENT_INVOICE_MISSING');
    expect(report.flags.map(x=>x.code)).toContain('RETURN_INVOICE_MISSING');
  });

  it('rejects non-object roots', () => {
    expect(() => buildLegacyDryRun([])).toThrow(TypeError);
  });
});
