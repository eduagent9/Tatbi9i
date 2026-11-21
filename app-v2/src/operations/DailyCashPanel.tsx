import {useCallback,useEffect,useState} from 'react';
import {formatMad,madToMinorUnits} from '../data/money';
import {openAppDatabase} from '../data/sqlite-database';
import {DailyCashRepository,type DailyCashClosing,type DailyCashPreview} from '../data/daily-cash';
function localDay(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
export function DailyCashPanel({ownerId}:{ownerId:string}){
 const [businessDate,setBusinessDate]=useState(localDay());
 const [opening,setOpening]=useState('0');
 const [counted,setCounted]=useState('');
 const [notes,setNotes]=useState('');
 const [preview,setPreview]=useState<DailyCashPreview|null>(null);
 const [history,setHistory]=useState<DailyCashClosing[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const load=useCallback(async()=>{const db=await openAppDatabase();setHistory(await new DailyCashRepository(db).list());},[]);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:'تعذر تحميل إغلاقات الصندوق.'));},[load]);
 async function calculate(){
  setBusy(true);setError('');setMessage('');
  try{const db=await openAppDatabase();const result=await new DailyCashRepository(db).preview(businessDate,madToMinorUnits(Number(opening)));setPreview(result);}
  catch(e){setError(e instanceof Error?e.message:'تعذر حساب الصندوق.');setPreview(null);}
  finally{setBusy(false);}
 }
 async function closeDay(){
  setBusy(true);setError('');setMessage('');
  try{
   const db=await openAppDatabase(),repo=new DailyCashRepository(db);
   const result=await repo.close({id:crypto.randomUUID(),businessDate,openingCashMinor:madToMinorUnits(Number(opening)),countedCashMinor:madToMinorUnits(Number(counted)),closedBy:ownerId,notes});
   setPreview(result);setHistory(await repo.list());setMessage('تسجل إغلاق اليوم. الفرق: '+formatMad(result.differenceMinor)+'.');
  }catch(e){setError(e instanceof Error?e.message:'تعذر إغلاق اليوم.');}
  finally{setBusy(false);}
 }
 return <section data-section="management" className="panel daily-cash-panel">
  <div className="panel-heading"><div><h3>إغلاق الصندوق اليومي</h3><p>قارن النقد المتوقع بالنقد الموجود فعلياً وسجل الفرق</p></div><span className="step-mark">نهاية اليوم</span></div>
  {error&&<div className="message error" role="alert">{error}</div>}{message&&<div className="message success" role="status">{message}</div>}
  <div className="two-cols"><label>التاريخ<input type="date" value={businessDate} onChange={e=>{setBusinessDate(e.target.value);setPreview(null);}}/></label><label>رصيد بداية اليوم (DH)<input type="number" min="0" step="0.01" value={opening} onChange={e=>{setOpening(e.target.value);setPreview(null);}}/></label></div>
  <button type="button" className="secondary-button" disabled={busy} onClick={calculate}>حساب الصندوق</button>
  {preview&&<div className="daily-cash-summary">
   <div><span>النقد الداخل</span><strong>{formatMad(preview.cashInMinor)}</strong></div>
   <div><span>مرتجعات نقدية</span><strong>{formatMad(preview.refundsMinor)}</strong></div>
   <div><span>مصاريف نقدية</span><strong>{formatMad(preview.expensesMinor)}</strong></div>
   <div><span>أداءات الموردين نقداً</span><strong>{formatMad(preview.supplierPaymentsMinor)}</strong></div>
   <div className="daily-cash-expected"><span>النقد المتوقع فالصندوق</span><strong>{formatMad(preview.expectedCashMinor)}</strong></div>
  </div>}
  <label>النقد الموجود فعلياً (DH)<input type="number" min="0" step="0.01" value={counted} onChange={e=>setCounted(e.target.value)} placeholder="عدّ الفلوس اللي فالصندوق"/></label>
  <label>ملاحظات أو سبب الفرق<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="اختياري"/></label>
  <button type="button" className="primary-button" disabled={busy||!preview||counted==='' } onClick={closeDay}>تأكيد إغلاق اليوم وحفظ المطابقة</button>
  <p className="hint">الإغلاق سجل تاريخي لا يحذف العمليات ولا يغير الفواتير. تأكد من تسجيل جميع المقبوضات والمصاريف قبل الإغلاق.</p>
  <div className="section-divider"></div><h4>آخر الإغلاقات</h4>
  {history.length===0?<p className="hint">مازال ما تسجل حتى إغلاق.</p>:history.map(row=><article className="daily-cash-history-row" key={row.id}><div><strong>{row.businessDate}</strong><span>متوقع {formatMad(row.expectedCashMinor)} · معدود {formatMad(row.countedCashMinor)}</span></div><strong className={row.differenceMinor===0?'cash-balanced':'cash-difference'}>{formatMad(row.differenceMinor)}</strong></article>)}
 </section>;
}
