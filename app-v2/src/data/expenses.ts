import type { SqliteExecutor } from './sqlite-database';
export type ExpensePaymentMethod='cash'|'bank'|'other';
export interface CreateExpenseInput { id:string; expenseNumber:string; category:string; amountMinor:number; paymentMethod:ExpensePaymentMethod; paidBy:string; note?:string; occurredAt?:string; }
export interface ExpenseRecord { id:string; expense_number:string; category:string; amount_minor:number; payment_method:ExpensePaymentMethod; paid_by:string; occurred_at:string; note:string|null; }
function required(value:string,label:string):string { const clean=value.trim(); if(!clean) throw new Error(label+' مطلوب.'); return clean; }
export class ExpenseRepository {
  constructor(private readonly db:SqliteExecutor,private readonly now:()=>string=()=>new Date().toISOString()) {}
  async create(input:CreateExpenseInput):Promise<void> {
    const id=required(input.id,'معرّف المصروف'),number=required(input.expenseNumber,'رقم المصروف');
    const category=required(input.category,'تصنيف المصروف'),paidBy=required(input.paidBy,'المستخدم');
    if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0) throw new RangeError('قيمة المصروف خاصها تكون مبلغاً صحيحاً موجباً بالسنتيم.');
    if(!['cash','bank','other'].includes(input.paymentMethod)) throw new Error('طريقة الأداء غير صالحة.');
    const occurredAt=input.occurredAt?.trim()||this.now(),createdAt=this.now();
    await this.db.run(
      'INSERT INTO expenses (id,expense_number,category,amount_minor,payment_method,paid_by,occurred_at,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id,number,category,input.amountMinor,input.paymentMethod,paidBy,occurredAt,input.note?.trim()||null,createdAt],
    );
  }
  async list(limit=50):Promise<ExpenseRecord[]> {
    if(!Number.isSafeInteger(limit)||limit<1||limit>500) throw new RangeError('عدد المصاريف المطلوب غير صالح.');
    const result=await this.db.query(
      'SELECT id,expense_number,category,amount_minor,payment_method,paid_by,occurred_at,note FROM expenses ORDER BY occurred_at DESC,id DESC LIMIT ?',
      [limit],
    );
    return (result.values??[]) as unknown as ExpenseRecord[];
  }
}
