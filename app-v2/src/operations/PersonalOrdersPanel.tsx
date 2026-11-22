import {useCallback,useEffect,useMemo,useState} from 'react';
import {formatMad,madToMinorUnits} from '../data/money';
import {openAppDatabase} from '../data/sqlite-database';
import {PersonalOrdersRepository,type PersonalOrderStatus} from '../data/personal-orders';
import {ProductImagesRepository} from '../data/product-images';

type Customer={id:string;name:string};
type Product={id:string;name:string;category:string|null;image_data_uri:string|null;sale_price_minor:number;total_stock:number;barcode:string|null};
type Order={id:string;order_number:string;customer_id:string;customer_name:string;status:PersonalOrderStatus;total_minor:number;created_at:string};
type Line={id:string;product_id:string;product_name_snapshot:string;quantity:number;unit_price_minor:number;remaining_quantity:number;unit_snapshot:string};
const labels:Record<PersonalOrderStatus,string>={submitted:'طلب جديد',preparing:'قيد التحضير',ready:'جاهز للتسليم',partially_delivered:'تسليم جزئي',delivered:'تم التسليم',cancelled:'ملغى'};

export function PersonalOrdersPanel({ownerId,customers,productColumns,onProductColumnsChange,onChanged}:{ownerId:string;customers:Customer[];productColumns:1|2|3;onProductColumnsChange:(value:1|2|3)=>void;onChanged?:()=>void|Promise<void>}){
 const [products,setProducts]=useState<Product[]>([]);
 const [locations,setLocations]=useState<Array<{id:string;label:string}>>([]);
 const [locationId,setLocationId]=useState('loc-depot-main');
 const [orders,setOrders]=useState<Order[]>([]);
 const [lines,setLines]=useState<Record<string,Line[]>>({});
 const [cart,setCart]=useState<Record<string,string>>({});
 const [customerId,setCustomerId]=useState('');
 const [discount,setDiscount]=useState('0');
 const [note,setNote]=useState('');
 const [deliveryQty,setDeliveryQty]=useState<Record<string,string>>({});
 const [collected,setCollected]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [gallery,setGallery]=useState<string[]>([]);
 const [galleryTitle,setGalleryTitle]=useState('');
 const [galleryIndex,setGalleryIndex]=useState(0);

 const load=useCallback(async()=>{
  const db=await openAppDatabase();
  const [loc,p,o]=await Promise.all([
   db.query("SELECT id,label FROM stock_locations WHERE is_active=1 ORDER BY CASE location_type WHEN 'depot' THEN 0 ELSE 1 END,label"),
   db.query(`SELECT p.id,p.name,p.category,p.image_data_uri,p.sale_price_minor,p.barcode,
    MAX(0,COALESCE(SUM(sb.quantity),0)-COALESCE((SELECT SUM(r.quantity-r.fulfilled_quantity) FROM sales_order_reservations r
      WHERE r.product_id=p.id AND r.location_id=? AND r.status='active'),0)) AS total_stock
    FROM products p LEFT JOIN stock_balances sb ON sb.product_id=p.id AND sb.location_id=?
    WHERE p.is_active=1 GROUP BY p.id ORDER BY p.name COLLATE NOCASE`,[locationId,locationId]),
   db.query(`SELECT o.id,o.order_number,o.customer_id,c.name AS customer_name,o.status,o.total_minor,o.created_at
    FROM sales_orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 100`)
  ]);
  const orderRows=(o.values??[]) as unknown as Order[];
  const lineEntries=await Promise.all(orderRows.map(async order=>{
   const r=await db.query(`SELECT sol.id,sol.product_id,sol.product_name_snapshot,sol.quantity,sol.unit_price_minor,sol.unit_snapshot,
    MAX(0,sol.quantity-COALESCE((SELECT SUM(il.quantity) FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
     WHERE i.order_id=sol.order_id AND il.product_id=sol.product_id AND i.status<>'voided'),0)) AS remaining_quantity
    FROM sales_order_lines sol WHERE sol.order_id=? ORDER BY sol.rowid`,[order.id]);
   return [order.id,(r.values??[]) as unknown as Line[]] as const;
  }));
  setLocations((loc.values??[]) as unknown as Array<{id:string;label:string}>);
  setProducts((p.values??[]) as unknown as Product[]);
  setOrders(orderRows);
  setLines(Object.fromEntries(lineEntries));
  setDeliveryQty(current=>{const next={...current};for(const [id,rows] of lineEntries)for(const line of rows)next[id+':'+line.id]??=String(line.remaining_quantity);return next;});
 },[locationId]);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:'تعذر تحميل الطلبات والمنتجات.'));},[load]);

 const cartRows=useMemo(()=>Object.entries(cart).filter(([,q])=>Number(q)>0).map(([id,q])=>({product:products.find(p=>p.id===id),quantity:Number(q)})).filter((x):x is {product:Product;quantity:number}=>!!x.product),[cart,products]);
 const total=cartRows.reduce((sum,x)=>sum+Math.round(x.quantity*x.product.sale_price_minor),0);
 async function run(action:()=>Promise<void>,success:string){
  setBusy(true);setError('');setMessage('');
  try{await action();await load();await onChanged?.();setMessage(success);}
  catch(e){setError(e instanceof Error?e.message:'تعذرت العملية.');}
  finally{setBusy(false);}
 }
 async function openGallery(product:Product){
  try{const db=await openAppDatabase();const rows=await new ProductImagesRepository(db).list(product.id);const images=rows.map(row=>row.image_data_uri);setGallery(images.length?images:(product.image_data_uri?[product.image_data_uri]:[]));setGalleryTitle(product.name);setGalleryIndex(0);}
  catch(e){setError(e instanceof Error?e.message:'تعذر فتح صور المنتج.');}
 }
 async function createOrder(){
  if(!customerId)throw new Error('اختار الزبون أولاً.');
  if(!cartRows.length)throw new Error('زيد منتج واحد على الأقل للطلب.');
  const db=await openAppDatabase();
  const repo=new PersonalOrdersRepository(db);
  const result=await repo.create({id:crypto.randomUUID(),orderNumber:'CMD-'+Date.now(),customerId,ownerId,locationId,
   lines:cartRows.map(x=>({productId:x.product.id,quantity:x.quantity})),discountMinor:madToMinorUnits(Number(discount)),note});
  setCart({});setDiscount('0');setNote('');setCustomerId('');
  setMessage('تسجل الطلب '+result.orderNumber+' وتحجز المخزون المتاح.');
 }
 async function advance(order:Order,next:PersonalOrderStatus){
  await run(async()=>{const db=await openAppDatabase();await new PersonalOrdersRepository(db).advance(order.id,next,ownerId);},'تحدّثت حالة الطلب.');
 }
 async function deliver(order:Order){
  await run(async()=>{
   const orderLines=lines[order.id]??[];
   const selected=orderLines.map(line=>({orderLineId:line.id,quantity:Number(deliveryQty[order.id+':'+line.id]??line.remaining_quantity)})).filter(x=>x.quantity>0);
   if(!selected.length)throw new Error('دخل كمية مسلّمة واحدة على الأقل.');
   const db=await openAppDatabase();
   const result=await new PersonalOrdersRepository(db).deliver({orderId:order.id,invoiceId:crypto.randomUUID(),invoiceNumber:'FAC-'+Date.now(),ownerId,lines:selected,
    collectedMinor:madToMinorUnits(Number(collected[order.id]??'0')),paymentMethod:'cash'});
   setMessage('تأكد التسليم. الفاتورة '+result.sale.invoiceNumber+' · '+(result.status==='delivered'?'الطلب تسلّم كامل':'باقي تسليم جزئي')+'.');
  },'تسجل التسليم والفاتورة وتحدّث المخزون والحسابات.');
 }
 return <section data-section="sales" className="panel personal-orders-panel">
  <div className="panel-heading"><div><h3>الطلبات والتسليم</h3><p>طلب جديد، حجز المخزون، ثم اعتماد البيع عند التسليم فقط</p></div><label className="product-columns-control">البطاقات فالسطر<select aria-label="عدد بطاقات المنتجات في السطر" value={productColumns} onChange={e=>onProductColumnsChange(Number(e.target.value) as 1|2|3)}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label></div>
  {error&&<div className="message error" role="alert">{error}</div>}{message&&<div className="message success" role="status">{message}</div>}
  <div className="personal-order-form">
   <label>مكان البيع<select value={locationId} onChange={e=>{setLocationId(e.target.value);setCart({});}}>{locations.map(location=><option key={location.id} value={location.id}>{location.label}</option>)}</select></label>
   <label>الزبون<select required value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">اختار الزبون</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <div className="personal-product-grid" style={{gridTemplateColumns:`repeat(${productColumns},minmax(0,1fr))`}}>{products.map(product=><article className="personal-product-card" key={product.id}>
    <div className="personal-product-image" role="button" tabIndex={0} aria-label={'عرض صور '+product.name} onClick={()=>openGallery(product)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openGallery(product);}}}>{product.image_data_uri?<img src={product.image_data_uri} alt={product.name}/>:<div className="personal-product-placeholder">صورة المنتج</div>}
     <div className="personal-product-quantity" onClick={e=>e.stopPropagation()}><button type="button" aria-label={'نقص كمية '+product.name} disabled={Number(cart[product.id]??0)<=0} onClick={()=>setCart(current=>({...current,[product.id]:String(Math.max(0,Number(current[product.id]??0)-1))}))}>−</button><input aria-label={'كمية '+product.name} type="number" min="0" max={product.total_stock} step="0.01" value={cart[product.id]??'0'} disabled={product.total_stock<=0} onChange={e=>setCart(current=>({...current,[product.id]:String(Math.min(product.total_stock,Math.max(0,Number(e.target.value)||0)))}))}/><button type="button" disabled={product.total_stock<=0||Number(cart[product.id]??0)>=product.total_stock} onClick={()=>setCart(current=>({...current,[product.id]:String(Math.min(product.total_stock,Number(current[product.id]??0)+1))}))}>＋</button></div>
    </div>
    <div className="personal-product-info"><strong>{product.name}</strong><span>{formatMad(product.sale_price_minor)} · {product.total_stock>0?'متوفر':'غير متوفر'}</span></div>
   </article>)}</div>
   <label>تخفيض الطلب (DH)<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
   <label>ملاحظة الطلب<input value={note} onChange={e=>setNote(e.target.value)} placeholder="اختياري"/></label>
   <div className="personal-order-total"><span>المجموع بعد التخفيض</span><strong>{formatMad(Math.max(0,total-madToMinorUnits(Number(discount))))}</strong></div>
   <button type="button" className="primary-button" disabled={busy||!customers.length||!products.length} onClick={()=>run(createOrder,'تسجل الطلب وتحجزت كمياته.')}>تسجيل الطلب وحجز المخزون</button>
  </div>
  <div className="section-divider"></div><h4>سجل الطلبات</h4>
  {orders.length===0?<p className="hint">مازال ما تسجل حتى طلب.</p>:<div className="personal-orders-list">{orders.map(order=><article className="personal-order-card" key={order.id}>
   <div className="personal-order-card-head"><div><strong>{order.order_number} · {order.customer_name}</strong><span>{new Date(order.created_at).toLocaleString('ar-MA')}</span></div><span className={'order-status status-'+order.status}>{labels[order.status]}</span></div>
   <div className="personal-order-lines">{(lines[order.id]??[]).map(line=><div className="personal-order-line" key={line.id}><span>{line.product_name_snapshot} · المطلوب {line.quantity} · باقي {line.remaining_quantity}</span><strong>{formatMad(line.unit_price_minor)}</strong>{['ready','partially_delivered'].includes(order.status)&&line.remaining_quantity>0&&<label>الكمية المسلّمة<input type="number" min="0" max={line.remaining_quantity} step="0.01" value={deliveryQty[order.id+':'+line.id]??String(line.remaining_quantity)} onChange={e=>setDeliveryQty(current=>({...current,[order.id+':'+line.id]:e.target.value}))}/></label>}</div>)}</div>
   <div className="personal-order-actions">
    {order.status==='submitted'&&<><button type="button" className="secondary-button" disabled={busy} onClick={()=>advance(order,'preparing')}>بدء التحضير</button><button type="button" className="remove-line" disabled={busy} onClick={()=>advance(order,'cancelled')}>إلغاء الطلب</button></>}
    {order.status==='preparing'&&<><button type="button" className="primary-button" disabled={busy} onClick={()=>advance(order,'ready')}>تأكيد الجاهزية</button><button type="button" className="remove-line" disabled={busy} onClick={()=>advance(order,'cancelled')}>إلغاء الطلب</button></>}
    {['ready','partially_delivered'].includes(order.status)&&<><label>المبلغ المؤدى عند التسليم (DH)<input type="number" min="0" step="0.01" value={collected[order.id]??'0'} onChange={e=>setCollected(current=>({...current,[order.id]:e.target.value}))}/></label><button type="button" className="primary-button" disabled={busy} onClick={()=>deliver(order)}>تأكيد الكميات المسلّمة وإصدار الفاتورة</button></>}
    <strong>قيمة الطلب: {formatMad(order.total_minor)}</strong>
   </div>
  </article>)}</div>}
 {gallery.length>0&&<div className="product-gallery-lightbox" role="dialog" aria-modal="true" aria-label={'صور '+galleryTitle} onClick={()=>setGallery([])}><button type="button" className="gallery-close" aria-label="إغلاق" onClick={()=>setGallery([])}>×</button><button type="button" className="gallery-arrow" disabled={gallery.length<2} onClick={e=>{e.stopPropagation();setGalleryIndex(i=>(i-1+gallery.length)%gallery.length);}}>‹</button><figure onClick={e=>e.stopPropagation()}><img src={gallery[galleryIndex]} alt={galleryTitle}/><figcaption>{galleryTitle} · {galleryIndex+1}/{gallery.length}</figcaption></figure><button type="button" className="gallery-arrow" disabled={gallery.length<2} onClick={e=>{e.stopPropagation();setGalleryIndex(i=>(i+1)%gallery.length);}}>›</button></div>}
 </section>;
}
