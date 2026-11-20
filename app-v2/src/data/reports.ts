import type { SqliteExecutor } from './sqlite-database';
export interface FinancialSummary {
  salesMinor:number; costMinor:number; grossProfitMinor:number; expensesMinor:number;
  netProfitMinor:number; outstandingMinor:number; invoiceCount:number; expenseCount:number;
}
/** Read-only totals. Invoice totals are queried separately from lines to avoid multiplying header values by line count. */
export class ReportsRepository {
  constructor(private readonly db:SqliteExecutor) {}
  async getFinancialSummary():Promise<FinancialSummary> {
    const invoices=await this.db.query(
      `SELECT COALESCE(SUM(total_minor),0) AS sales_minor,
       COALESCE(SUM(MAX(0,total_minor-collected_minor)),0) AS outstanding_minor,
       COUNT(*) AS invoice_count
       FROM invoices
       WHERE confirmed_at IS NOT NULL AND status NOT IN ('voided','returned')`,
    );
    const costs=await this.db.query(
      `SELECT COALESCE(SUM(il.quantity*il.unit_cost_minor),0) AS cost_minor
       FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
       WHERE i.confirmed_at IS NOT NULL AND i.status NOT IN ('voided','returned')`,
    );
    const expenses=await this.db.query('SELECT COALESCE(SUM(amount_minor),0) AS expenses_minor,COUNT(*) AS expense_count FROM expenses');
    const invoiceRow=invoices.values?.[0]??{}, costRow=costs.values?.[0]??{}, expenseRow=expenses.values?.[0]??{};
    const salesMinor=Math.round(Number(invoiceRow.sales_minor??0)),costMinor=Math.round(Number(costRow.cost_minor??0));
    const expensesMinor=Number(expenseRow.expenses_minor??0);
    if(![salesMinor,costMinor,expensesMinor].every(Number.isSafeInteger)||salesMinor<0||costMinor<0||expensesMinor<0) throw new Error('المعطيات المالية غير صالحة وخصها مراجعة.');
    const grossProfitMinor=salesMinor-costMinor;
    return {salesMinor,costMinor,grossProfitMinor,expensesMinor,netProfitMinor:grossProfitMinor-expensesMinor,
      outstandingMinor:Math.max(0,Math.round(Number(invoiceRow.outstanding_minor??0))),
      invoiceCount:Number(invoiceRow.invoice_count??0),expenseCount:Number(expenseRow.expense_count??0)};
  }
}
