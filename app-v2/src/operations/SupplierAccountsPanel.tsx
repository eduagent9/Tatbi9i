import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {formatMad,madToMinorUnits} from '../data/money';
import {openAppDatabase} from '../data/sqlite-database';
import {DistributionRepository,type SupplierAccountRow} from '../data/distribution';

type Supplier={id:string;name:string};
export function SupplierAccountsPanel({ownerId,suppliers}:{ownerId:string;suppliers:Supplier[]}){
 const [accounts,setAccounts]=useState<SupplierAccountRow[]>([]);
 const [supplierId,setSupplierId]=useState('');
 const [amount,setAmount]=useState('');
 const [method,setMethod]=useState<'cash'|'bank'|'other'>('cash');
 const [reference,setReference]=useState('');
 const [note,setNote]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const load=useCallback(async()=>{const db=await openAppDatabase();setAccounts(await new DistributionRepository(db).listSupplierAccounts());},[]);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:'تعذر تحميل حسابات الموردين.'));},[load]);
 async function pay(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   const db=await openAppDatabase(),repo=new DistributionRepository(db),amountMinor=madToMinorUnits(Number(amount));
   await repo.recordSupplierPayment({id:crypto.randomUUID(),supplierId,amountMinor,method,paidBy:ownerId,referenceNumber:reference,note});
   setAmount('');setReference('');setNote('');await load();setMessage('تسجل أداء المورد وتحدّث الرصيد.');
  }catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل أداء المورد.');}
  finally{setBusy(false);}
 }
 return <div className="supplier-accounts-panel">
  <div className="section-divider"></div><div className="panel-heading"><div><h4>حسابات الموردين والأداءات</h4><p>المشتريات، المبالغ المؤداة، والرصيد المتبقي لكل مورد</p></div></div>
  {error&&<div className="message error" role="alert">{error}</div>}{message&&<div className="message success" role="status">{message}</div>}
  <div className="supplier-account-list">{accounts.map(account=><article className="supplier-account-row" key={account.supplier_id}>
   <strong>{account.supplier_name}</strong><div><span>المشتريات</span><b>{formatMad(account.purchased_minor)}</b></div><div><span>المؤدى</span><b>{formatMad(account.paid_minor)}</b></div><div><span>المرتجعات</span><b>{formatMad(account.returned_minor)}</b></div><div className="supplier-account-balance"><span>الباقي</span><b>{formatMad(account.balance_minor)}</b></div>
  </article>)}</div>
  <form onSubmit={pay} className="supplier-payment-form">
   <label>المورد<select required value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">اختار المورد</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <div className="two-cols"><label>مبلغ الأداء (DH)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>طريقة الأداء<select value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option value="cash">نقداً</option><option value="bank">تحويل بنكي</option><option value="other">أخرى</option></select></label></div>
   <label>رقم المرجع<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="اختياري"/></label>
   <label>ملاحظة<input value={note} onChange={e=>setNote(e.target.value)} placeholder="اختياري"/></label>
   <button className="primary-button" disabled={busy||!supplierId}>{busy?'كيتسجل الأداء...':'تسجيل أداء المورد'}</button>
  </form>
 </div>;
}
