import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { openAppDatabase, type SqliteExecutor } from '../data/sqlite-database';
import { StockCountRepository } from '../data/stock-counts';
import { ReturnsRepository, type ReturnCondition } from '../data/returns';

type ProductOption={id:string;name:string;variant_id:string|null;variant_name:string|null};
type CountRow={product_id:string;product_name:string;variant_id:string|null;variant_name:string|null;batch_id:string|null;batch_code:string|null;expected:number;counted:string};
type InvoiceOption={id:string;invoice_number:string;customer_name:string;created_at:string};
type InvoiceLine={id:string;product_id:string;product_name:string;variant_id:string|null;quantity:number;unit_price_minor:number;remaining:number};
const owner='local-owner',depot='loc-depot-main';
const uid=()=>crypto.randomUUID();

export function StockAndReturnsPanel(){
 const [db,setDb]=useState<SqliteExecutor|null>(null);
 const [counts,setCounts]=useState<CountRow[]>([]);
 const [invoices,setInvoices]=useState<InvoiceOption[]>([]);
 const [invoiceId,setInvoiceId]=useState('');
 const [invoiceLines,setInvoiceLines]=useState<InvoiceLine[]>([]);
 const [returnQty,setReturnQty]=useState<Record<string,string>>({});
 const [returnCondition,setReturnCondition]=useState<Record<string,ReturnCondition>>({});
 const [countNote,setCountNote]=useState('');
 const [returnReason,setReturnReason]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const selectedInvoice=useMemo(()=>invoices.find(x=>x.id===invoiceId),[invoices,invoiceId]);

 async function loadCounts(connection:SqliteExecutor){
  const result=await connection.query(`SELECT p.id AS product_id,p.name AS product_name,
    b.variant_id,v.variant_name,b.batch_id,pb.batch_code,COALESCE(b.quantity,0) AS expected
    FROM products p
    LEFT JOIN stock_balances b ON b.product_id=p.id AND b.location_id=?
    LEFT JOIN product_variants v ON v.id=b.variant_id
    LEFT JOIN product_batches pb ON pb.id=b.batch_id
    WHERE p.is_active=1
    ORDER BY p.name,pb.expiry_date,pb.batch_code`,[depot]);
  const rows=(result.values??[]) as unknown as Array<Omit<CountRow,'counted'>>;
  setCounts(rows.map(r=>({...r,counted:''})));
 }
 async function loadInvoices(connection:SqliteExecutor){
  const result=await connection.query(`SELECT i.id,i.invoice_number,c.name AS customer_name,i.created_at
    FROM invoices i JOIN customers c ON c.id=i.customer_id
    WHERE i.confirmed_at IS NOT NULL AND i.status IN ('confirmed','partially_returned')
    ORDER BY i.created_at DESC`);
  setInvoices((result.values??[]) as unknown as InvoiceOption[]);
 }
 useEffect(()=>{let live=true;openAppDatabase().then(async connection=>{if(!live)return;setDb(connection);await Promise.all([loadCounts(connection),loadInvoices(connection)]);})
  .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر تحميل بيانات الجرد والمرتجعات.');});
  return()=>{live=false;};},[]);
 useEffect(()=>{if(!db||!invoiceId){setInvoiceLines([]);return;}let live=true;
  db.query(`SELECT il.id,il.product_id,il.product_name_snapshot AS product_name,il.variant_id,il.quantity,il.unit_price_minor,
    il.quantity-COALESCE((SELECT SUM(rl.quantity) FROM product_return_lines rl JOIN product_returns r ON r.id=rl.return_id
      WHERE rl.invoice_line_id=il.id AND r.status='completed'),0) AS remaining
    FROM invoice_lines il WHERE il.invoice_id=? ORDER BY il.rowid`,[invoiceId])
   .then(r=>{if(live)setInvoiceLines((r.values??[]) as unknown as InvoiceLine[]);})
   .catch(e=>{if(live)setError(e instanceof Error?e.message:'تعذر تحميل تفاصيل الفاتورة.');});
  return()=>{live=false;};
 },[db,invoiceId]);

 async function submitCount(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!db)return;setError('');setMessage('');
  const lines=counts.filter(x=>x.counted.trim()!=='');
  if(!lines.length){setError('دخل الكمية الفعلية لمنتج واحد على الأقل.');return;}
  if(lines.some(x=>!Number.isFinite(Number(x.counted))||Number(x.counted)<0)){setError('تأكد أن كميات الجرد أرقام صحيحة أو صفر.');return;}
  setBusy(true);
  try{
   const result=await new StockCountRepository(db).complete({id:uid(),countNumber:'JRD-'+Date.now(),locationId:depot,countedBy:owner,note:countNote,
    lines:lines.map(x=>({id:uid(),productId:x.product_id,variantId:x.variant_id,batchId:x.batch_id,countedQuantity:Number(x.counted)}))});
   await loadCounts(db);setCountNote('');setMessage('تسجل الجرد '+result.countNumber+'؛ تمت تسوية '+result.changedLineCount+' سطر.');
  }catch(e){setError(e instanceof Error?e.message:'تعذر إتمام الجرد.');}finally{setBusy(false);}
 }
 async function submitReturn(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!db||!selectedInvoice)return;setError('');setMessage('');
  const lines=invoiceLines.filter(x=>Number(returnQty[x.id]||0)>0);
  if(!lines.length){setError('حدد كمية مرتجعة واحدة على الأقل.');return;}
  if(lines.some(x=>Number(returnQty[x.id])>x.remaining)){setError('كمية المرتجع أكبر من الكمية المتبقية في الفاتورة.');return;}
  if(!returnReason.trim()){setError('كتب سبب الإرجاع.');return;}
  setBusy(true);
  try{
   const result=await new ReturnsRepository(db).complete({id:uid(),returnNumber:'RET-'+Date.now(),invoiceId,processedBy:owner,
    destinationLocationId:depot,reason:returnReason,refundMethod:'cash',
    lines:lines.map(x=>({id:uid(),invoiceLineId:x.id,quantity:Number(returnQty[x.id]),condition:returnCondition[x.id]??'sellable'}))});
   await loadCounts(db);await loadInvoices(db);setInvoiceId('');setReturnQty({});setReturnCondition({});setReturnReason('');
   setMessage('تسجل المرتجع '+result.returnNumber+' بقيمة '+(result.returnedValueMinor/100).toFixed(2)+' DH. المبلغ المسترجع نقداً: '+(result.refundMinor/100).toFixed(2)+' DH.');
  }catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل المرتجع.');}finally{setBusy(false);}
 }
 return <section className="panel operations-panel">
  <div className="panel-heading"><div><h3>الجرد والمرتجعات</h3><p>تسوية المخزون وإرجاع السلع من فواتير البيع</p></div><span className="step-mark">12</span></div>
  {error&&<p className="hint" role="alert">{error}</p>}{message&&<p className="hint" role="status">{message}</p>}
  <div className="section-divider"></div>
  <h4>جرد المستودع الرئيسي</h4>
  <p className="hint">دخل الكمية اللي لقيتي فعلياً. خانات فارغة ما كتدخلش فعملية الجرد؛ كل سطر مؤكد كيتسجل مع الرصيد والفرق وحركة التسوية.</p>
  <form onSubmit={submitCount}>
   {counts.length===0?<p className="hint">ما كايناش منتجات نشيطة للجرد.</p>:<div className="movement-list">
    {counts.map((x,i)=><div className="movement-row" key={x.product_id+'|'+(x.variant_id??'')+'|'+(x.batch_id??'')+'|'+i}>
     <div><strong>{x.product_name}</strong><span>النظام: {x.expected}{x.batch_code?' · دفعة '+x.batch_code:''}{x.variant_name?' · '+x.variant_name:''}</span></div>
     <label className="count-input-label">الفعلي<input aria-label={'الكمية الفعلية '+x.product_name} type="number" min="0" step="0.001" value={x.counted} onChange={e=>setCounts(current=>current.map((row,index)=>index===i?{...row,counted:e.target.value}:row))} placeholder="—"/></label>
    </div>)}
   </div>}
   <label>ملاحظة الجرد<input value={countNote} onChange={e=>setCountNote(e.target.value)} placeholder="اختياري"/></label>
   <button className="primary-button" disabled={busy||counts.every(x=>!x.counted.trim())}>{busy?'كيتم تسجيل الجرد...':'تأكيد الجرد وتسوية المخزون'}</button>
  </form>
  <div className="section-divider"></div>
  <h4>تسجيل مرتجع زبون</h4>
  <p className="hint">المرتجع خاصو يكون من فاتورة مؤكدة. الكمية اللي سبق ترجعَت ما يمكنش ترجع مرة ثانية. السلع القابلة للبيع فقط كترجع للمخزون.</p>
  <form onSubmit={submitReturn}>
   <label>الفاتورة<select required value={invoiceId} onChange={e=>{setInvoiceId(e.target.value);setReturnQty({});setReturnCondition({});}}><option value="">اختار فاتورة</option>
    {invoices.map(x=><option key={x.id} value={x.id}>{x.invoice_number} · {x.customer_name} · {new Date(x.created_at).toLocaleDateString('ar-MA')}</option>)}
   </select></label>
   {selectedInvoice&&invoiceLines.map(line=><div className="purchase-line" key={line.id}>
    <strong>{line.product_name}</strong><span className="hint">المتبقي للإرجاع: {line.remaining} · ثمن الوحدة: {(line.unit_price_minor/100).toFixed(2)} DH</span>
    <div className="two-cols"><label>الكمية<input type="number" min="0" max={line.remaining} step="0.001" value={returnQty[line.id]??''} onChange={e=>setReturnQty(current=>({...current,[line.id]:e.target.value}))} placeholder="0"/></label>
    <label>حالة السلعة<select value={returnCondition[line.id]??'sellable'} onChange={e=>setReturnCondition(current=>({...current,[line.id]:e.target.value as ReturnCondition}))}><option value="sellable">صالحة للبيع</option><option value="damaged">تالفة</option><option value="expired">منتهية الصلاحية</option><option value="shortage">ناقصة / غير مسترجعة للمخزون</option></select></label></div>
   </div>)}
   <label>سبب الإرجاع<input required value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder="مثلاً: منتج معيب أو خطأ في الطلب"/></label>
   <button className="primary-button" disabled={busy||!invoiceId||invoiceLines.length===0||!invoiceLines.some(x=>Number(returnQty[x.id]||0)>0)}>{busy?'كيتسجل المرتجع...':'تأكيد المرتجع وتحديث الفاتورة'}</button>
  </form>
 </section>;
}
