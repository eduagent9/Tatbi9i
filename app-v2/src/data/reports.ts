import type { SqliteExecutor } from './sqlite-database';
export interface FinancialSummary {
  salesMinor:number; costMinor:number; grossProfitMinor:number; expensesMinor:number;
  netProfitMinor:number; outstandingMinor:number; invoiceCount:number; expenseCount:number;
}
/** Read-only totals. Sales already include invoice discounts; COGS uses immutable line cost snapshots. */
export class ReportsRepository {
  constructor(private readonly db:SqliteExecutor) {}
  async getFinancialSummary():Promise<FinancialSummary> {
    const sales=await this.db.query(
      `SELECT COALESCE(SUM(i.total_minor),0) AS sales_minor,
       COALESCE(SUM(il.quantity*il.unit_cost_minor),0) AS cost_minor,
       COALESCE(SUM(MAX(0,i.total_minor-i.collected_minor)),0) AS outstanding_minor,
       COUNT(DISTINCT i.id) AS invoice_count
       FROM invoices i LEFT JOIN invoice_lines il ON il.invoice_id=i.id
       WHERE i.confirmed_at IS NOT NULL AND i.status NOT IN ('voided','returned')`,
    );
    const expenses=await this.db.query('SELECT COALESCE(SUM(amount_minor),0) AS expenses_minor,COUNT(*) AS expense_count FROM expenses');
    const row=sales.values?.[0]??{}, expenseRow=expenses.values?.[0]??{};
    const salesMinor=Math.round(Number(row.sales_minor??0)),costMinor=Math.round(Number(row.cost_minor??0));
    const expensesMinor=Number(expenseRow.expenses_minor??0);
    if(![salesMinor,costMinor,expensesMinor].every(Number.isSafeInteger)||salesMinor<0||costMinor<0||expensesMinor<0) throw new Error('المعطيات المالية غير صالحة وخصها مراجعة.');
    const grossProfitMinor=salesMinor-costMinor;
    return {salesMinor,costMinor,grossProfitMinor,expensesMinor,netProfitMinor:grossProfitMinor-expensesMinor,
      outstandingMinor:Math.max(0,Math.round(Number(row.outstanding_minor??0))),
      invoiceCount:Number(row.invoice_count??0),expenseCount:Number(expenseRow.expense_count??0)};
  }
}
