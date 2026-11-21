import {useCallback,useEffect,useState} from 'react';
import {formatMad} from '../data/money';
import {openAppDatabase} from '../data/sqlite-database';

export type PrintableInvoice={
 number:string;date:string;customer:string;phone:string|null;city:string|null;seller:string;
 lines:Array<{name:string;quantity:number;unitPrice:number;total:number}>;
 subtotal:number;discount:number;total:number;collected:number;due:number;
};
type InvoiceRow={id:string;invoice_number:string;created_at:string;customer_name:string;phone:string|null;city:string|null;seller_name:string;subtotal_minor:number;discount_minor:number;total_minor:number;collected_minor:number;};
export function InvoiceArchivePanel({onSelect}:{onSelect:(invoice:PrintableInvoice)=>void}){
 const [rows,setRows]=useState<InvoiceRow[]>([]);
 const [search,setSearch]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{
  const db=await openAppDatabase(),term='%'+search.trim().replace(/[\\%_]/g,'\\$&')+'%';
  const result=await db.query(`SELECT i.id,i.invoice_number,i.created_at,c.name AS customer_name,c.phone,c.city,u.display_name AS seller_name,
   i.subtotal_minor,i.offer_discount_minor AS discount_minor,i.total_minor,i.collected_minor
   FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN users u ON u.id=i.seller_user_id
   WHERE i.status NOT IN ('voided') AND (i.invoice_number LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR COALESCE(c.phone,'') LIKE ? ESCAPE '\\')
   ORDER BY COALESCE(i.confirmed_at,i.created_at) DESC LIMIT 100`,[term,term,term]);
  setRows((result.values??[]) as unknown as InvoiceRow[]);
 },[search]);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:'تعذر تحميل أرشيف الفواتير.'));},[load]);
 async function printInvoice(row:InvoiceRow){
  setError('');setBusy(true);
  try{
   const db=await openAppDatabase();
   const lines=await db.query('SELECT product_name_snapshot,quantity,unit_price_minor,line_total_minor FROM invoice_lines WHERE invoice_id=? ORDER BY rowid',[row.id]);
   onSelect({number:row.invoice_number,date:new Date(row.created_at).toLocaleString('fr-MA'),customer:row.customer_name,phone:row.phone,city:row.city,seller:row.seller_name,
    lines:(lines.values??[]).map(line=>({name:String(line.product_name_snapshot),quantity:Number(line.quantity),unitPrice:Number(line.unit_price_minor),total:Number(line.line_total_minor)})),
    subtotal:Number(row.subtotal_minor),discount:Number(row.discount_minor),total:Number(row.total_minor),collected:Number(row.collected_minor),due:Number(row.total_minor)-Number(row.collected_minor)});
  }catch(e){setError(e instanceof Error?e.message:'تعذر فتح الفاتورة.');}
  finally{setBusy(false);}
 }
 return <section data-section="sales" className="panel invoice-archive-panel">
  <div className="panel-heading"><div><h3>أرشيف الفواتير</h3><p>آخر 100 فاتورة مؤكدة؛ تقدر تعاود تعرضها وتطبعها PDF</p></div><span className="step-mark">الفواتير</span></div>
  <input className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="قلب برقم الفاتورة أو اسم الزبون أو الهاتف..."/>
  {error&&<p className="message error" role="alert">{error}</p>}
  {rows.length===0?<p className="hint">ما لقاينا حتى فاتورة مطابقة.</p>:<div className="invoice-archive-list">{rows.map(row=><article className="customer-row" key={row.id}>
   <div><strong>{row.invoice_number} · {row.customer_name}</strong><span>{new Date(row.created_at).toLocaleString('ar-MA')} · {row.seller_name}</span><span>الصافي {formatMad(row.total_minor)} · المؤدى {formatMad(row.collected_minor)} · الباقي {formatMad(row.total_minor-row.collected_minor)}</span></div>
   <button type="button" className="secondary-button" disabled={busy} onClick={()=>void printInvoice(row)}>عرض / طباعة</button>
  </article>)}</div>}
 </section>;
}
