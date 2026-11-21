import {useCallback,useEffect,useMemo,useState} from 'react';
import {formatMad,madToMinorUnits} from '../data/money';
import {type AppRole} from '../data/permissions';
import {openAppDatabase} from '../data/sqlite-database';
import {DistributionRepository,type CustomerAgingRow,type SupplierAccountRow} from '../data/distribution';

type User={id:string;display_name:string;role:AppRole;is_active:number};
type Vehicle={id:string;code:string;label:string;vehicle_type:'van_sales'|'delivery';assigned_user_id:string|null;assigned_name?:string|null};
type Customer={id:string;name:string};
type Product={id:string;name:string;purchase_cost_minor:number};
type RouteRow={id:string;route_code:string;name:string;planned_date:string;vehicle_label:string;driver_user_id:string;driver_name:string;status:'planned'|'started'|'completed'|'cancelled';stop_count:number};
type StopRow={id:string;route_id:string;stop_order:number;customer_id:string;customer_name:string;order_id:string|null;status:string;failure_reason:string|null};
type VehicleStockRow={product_id:string;product_name:string;variant_id:string|null;variant_name:string|null;batch_id:string|null;batch_code:string|null;quantity:number};
type Props={user:User;users:User[];vehicles:Vehicle[];customers:Customer[];products:Product[]};

const statusLabel:Record<string,string>={planned:'مخططة',started:'جارية',completed:'مكتملة',cancelled:'ملغاة',pending:'في الانتظار',arrived:'وصل',partially_delivered:'تسليم جزئي',delivered:'تم التسليم',failed:'تعذر التسليم',skipped:'تم تجاوزها'};

export function DistributionOperationsPanel({user,users,vehicles,customers,products}:Props){
 const [routes,setRoutes]=useState<RouteRow[]>([]);
 const [stops,setStops]=useState<StopRow[]>([]);
 const [accounts,setAccounts]=useState<SupplierAccountRow[]>([]);
 const [aging,setAging]=useState<CustomerAgingRow[]>([]);
 const [creditLimits,setCreditLimits]=useState<Record<string,string>>({});
 const [routeName,setRouteName]=useState('');
 const [routeDate,setRouteDate]=useState(new Date().toISOString().slice(0,10));
 const [routeVehicle,setRouteVehicle]=useState('');
 const [routeStops,setRouteStops]=useState<string[]>(['']);
 const [supplierId,setSupplierId]=useState('');
 const [supplierAmount,setSupplierAmount]=useState('');
 const [supplierMethod,setSupplierMethod]=useState<'cash'|'bank'|'other'>('cash');
 const [returnSupplierId,setReturnSupplierId]=useState('');
 const [returnProductId,setReturnProductId]=useState('');
 const [returnQuantity,setReturnQuantity]=useState('1');
 const [returnUnitCost,setReturnUnitCost]=useState('');
 const [returnReason,setReturnReason]=useState('');
 const [recipient,setRecipient]=useState<Record<string,string>>({});
 const [failure,setFailure]=useState<Record<string,string>>({});
 const [counts,setCounts]=useState<VehicleStockRow[]>([]);
 const [countValues,setCountValues]=useState<Record<string,string>>({});
 const [vehicleSession,setVehicleSession]=useState<{id:string;vehicle_id:string;business_date:string;expected_cash_minor:number}|null>(null);
 const [odometer,setOdometer]=useState('');
 const [openingCash,setOpeningCash]=useState('');
 const [closingCash,setClosingCash]=useState('');
 const [closingOdometer,setClosingOdometer]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');

 const canManage= user.role==='owner'||user.role==='depot_manager';
 const assignedVehicle=vehicles.find(v=>v.vehicle_type==='delivery'&&v.assigned_user_id===user.id);
 const load=useCallback(async()=>{
  const db=await openAppDatabase(),repo=new DistributionRepository(db);
  const [r,s,a,g,c]=await Promise.all([
   db.query(`SELECT r.id,r.route_code,r.name,r.planned_date,v.label AS vehicle_label,r.driver_user_id,u.display_name AS driver_name,r.status,
    (SELECT COUNT(*) FROM delivery_route_stops x WHERE x.route_id=r.id) AS stop_count
    FROM delivery_routes r JOIN vehicles v ON v.id=r.vehicle_id JOIN users u ON u.id=r.driver_user_id
    WHERE r.status IN ('planned','started') OR r.planned_date>=date('now','-7 day')
    ORDER BY r.planned_date DESC,r.created_at DESC LIMIT 50`),
   db.query(`SELECT s.id,s.route_id,s.stop_order,s.customer_id,c.name AS customer_name,s.order_id,s.status,s.failure_reason
    FROM delivery_route_stops s JOIN customers c ON c.id=s.customer_id
    JOIN delivery_routes r ON r.id=s.route_id WHERE r.status IN ('planned','started')
    ORDER BY r.planned_date,s.route_id,s.stop_order`),
   repo.listSupplierAccounts(),repo.listCustomerAging(),
   db.query('SELECT id,credit_limit_minor FROM customers WHERE is_active=1')
  ]);
  setRoutes((r.values??[]) as unknown as RouteRow[]);
  setStops((s.values??[]) as unknown as StopRow[]);
  setAccounts(a);setAging(g);
  setCreditLimits(Object.fromEntries((c.values??[]).map(row=>[String(row.id),String(row.credit_limit_minor??0)])));
  if(assignedVehicle){
   const session=await db.query("SELECT id,vehicle_id,business_date,expected_cash_minor FROM vehicle_day_sessions WHERE vehicle_id=? AND responsible_user_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1",[assignedVehicle.id,user.id]);
   setVehicleSession((session.values?.[0] as unknown as typeof vehicleSession)??null);
   if(session.values?.[0]){
    const stock=await db.query(`SELECT sb.product_id,p.name AS product_name,sb.variant_id,pv.variant_name,sb.batch_id,pb.batch_code,sb.quantity
      FROM stock_balances sb JOIN products p ON p.id=sb.product_id
      LEFT JOIN product_variants pv ON pv.id=sb.variant_id
      LEFT JOIN product_batches pb ON pb.id=sb.batch_id
      JOIN stock_locations sl ON sl.id=sb.location_id
      WHERE sl.vehicle_id=? AND sb.quantity>0 ORDER BY p.name,pv.variant_name,pb.batch_code`,[assignedVehicle.id]);
    const rows=(stock.values??[]) as unknown as VehicleStockRow[];setCounts(rows);
    setCountValues(current=>Object.fromEntries(rows.map(row=>[row.product_id+'|'+(row.variant_id??'')+'|'+(row.batch_id??''),current[row.product_id+'|'+(row.variant_id??'')+'|'+(row.batch_id??'')]??String(row.quantity)])));
   }else{setCounts([]);setVehicleSession(null);}
  }
 },[assignedVehicle?.id,user.id]);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:'تعذر تحميل بيانات التوزيع.'));},[load]);

 async function action(fn:()=>Promise<void>,success:string){
  setError('');setNotice('');setBusy(true);
  try{await fn();await load();setNotice(success);}
  catch(e){setError(e instanceof Error?e.message:'تعذرت العملية.');}
  finally{setBusy(false);}
 }
 async function createRoute(){
  if(!canManage)throw new Error('ما عندكش صلاحية إنشاء الجولات.');
  const vehicle=vehicles.find(v=>v.id===routeVehicle&&v.vehicle_type==='delivery');
  if(!vehicle?.assigned_user_id)throw new Error('اختار سيارة توصيل معيّنة لسائق نشيط.');
  const selected=routeStops.filter(Boolean);
  if(!selected.length)throw new Error('زيد محطة واحدة على الأقل.');
  const db=await openAppDatabase();
  await new DistributionRepository(db).createRoute({id:crypto.randomUUID(),code:'TR-'+Date.now(),name:routeName||'جولة '+routeDate,plannedDate:routeDate,vehicleId:vehicle.id,driverUserId:vehicle.assigned_user_id,createdBy:user.id,stops:selected.map((customerId,index)=>({id:crypto.randomUUID(),customerId,stopOrder:index+1}))});
  setRouteName('');setRouteStops(['']);
 }
 async function recordPayment(){
  if(!canManage)throw new Error('ما عندكش صلاحية أداء الموردين.');
  const amount=madToMinorUnits(Number(supplierAmount));
  const db=await openAppDatabase();
  await new DistributionRepository(db).recordSupplierPayment({id:crypto.randomUUID(),supplierId,amountMinor:amount,method:supplierMethod,paidBy:user.id});
  setSupplierAmount('');
 }
 async function submitSupplierReturn(){
  if(!canManage)throw new Error('ما عندكش صلاحية إرجاع السلع للمورد.');
  const db=await openAppDatabase();
  const result=await new DistributionRepository(db).createSupplierReturn({id:crypto.randomUUID(),supplierId:returnSupplierId,reason:returnReason,processedBy:user.id,lines:[{productId:returnProductId,quantity:Number(returnQuantity),unitCostMinor:madToMinorUnits(Number(returnUnitCost))}]});
  setReturnQuantity('1');setReturnReason('');
  setNotice('تسجل إرجاع المورد بقيمة '+formatMad(result.totalMinor)+' وتخصم المخزون.');
 }
 async function saveLimit(customerId:string){
  if(user.role!=='owner')throw new Error('تغيير سقف الدين من صلاحية المالك فقط.');
  const limit=madToMinorUnits(Number(creditLimits[customerId]??'0'));
  const db=await openAppDatabase();await new DistributionRepository(db).setCustomerCreditLimit(customerId,limit,user.id);
 }
 async function startVehicleDay(){
  if(!assignedVehicle)throw new Error('ما عندكش سيارة توصيل معيّنة.');
  const db=await openAppDatabase();
  const cash=await db.query("SELECT COALESCE(SUM(expected_cash_minor),0) AS amount FROM cash_sessions WHERE vehicle_id=? AND user_id=? AND status='open'",[assignedVehicle.id,user.id]);
  await new DistributionRepository(db).startVehicleDay({id:crypto.randomUUID(),vehicleId:assignedVehicle.id,responsibleUserId:user.id,businessDate:new Date().toISOString().slice(0,10),openingOdometer:odometer===''?null:Number(odometer),openingCashMinor:madToMinorUnits(Number(openingCash||0)),expectedCashMinor:Number(cash.values?.[0]?.amount??0)});
 }
 async function closeVehicleDay(){
  if(!vehicleSession)throw new Error('ما كايناش جلسة سيارة مفتوحة.');
  const db=await openAppDatabase();
  const result=await new DistributionRepository(db).closeVehicleDay({sessionId:vehicleSession.id,responsibleUserId:user.id,closingOdometer:closingOdometer===''?null:Number(closingOdometer),countedCashMinor:madToMinorUnits(Number(closingCash)),counts:counts.map(row=>({productId:row.product_id,variantId:row.variant_id,batchId:row.batch_id,countedQuantity:Number(countValues[row.product_id+'|'+(row.variant_id??'')+'|'+(row.batch_id??'')])}))});
  setNotice('تسدات جلسة السيارة. فرق النقدية: '+formatMad(result.cashDifferenceMinor)+' · اختلافات المخزون: '+result.stockVariances);
 }

 const driverRoutes=useMemo(()=>routes.filter(r=>user.role==='delivery_driver'?r.driver_user_id===user.id:true),[routes,user]);
 return <section data-section="distribution" className="panel distribution-operations">
  <div className="panel-heading"><div><h3>التوزيع والجولات وتسوية السيارات</h3><p>مسارات الزيارات، إثبات التسليم، حسابات الموردين والديون</p></div><span className="step-mark">التوزيع</span></div>
  {error&&<p className="message error" role="alert">{error}</p>}{notice&&<p className="message success" role="status">{notice}</p>}
  {canManage&&<div className="distribution-subpanel">
   <h4>تخطيط جولة توصيل</h4>
   <form onSubmit={e=>{e.preventDefault();void action(createRoute,'تسجلات الجولة وتربطات بالسائق.');}}>
    <label>اسم الجولة<input value={routeName} onChange={e=>setRouteName(e.target.value)} placeholder="مثلاً: وسط المدينة"/></label>
    <div className="two-cols"><label>التاريخ<input type="date" required value={routeDate} onChange={e=>setRouteDate(e.target.value)}/></label><label>سيارة التوصيل<select required value={routeVehicle} onChange={e=>setRouteVehicle(e.target.value)}><option value="">اختار السيارة والسائق</option>{vehicles.filter(v=>v.vehicle_type==='delivery'&&v.assigned_user_id).map(v=><option key={v.id} value={v.id}>{v.label} · {v.assigned_name||users.find(u=>u.id===v.assigned_user_id)?.display_name}</option>)}</select></label></div>
    {routeStops.map((stop,index)=><div className="two-cols" key={index}><label>المحطة {index+1}<select required value={stop} onChange={e=>setRouteStops(rows=>rows.map((x,i)=>i===index?e.target.value:x))}><option value="">اختار الزبون</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button type="button" className="remove-line" disabled={routeStops.length===1} onClick={()=>setRouteStops(rows=>rows.filter((_,i)=>i!==index))}>حذف المحطة</button></div>)}
    <button type="button" className="secondary-button" onClick={()=>setRouteStops(rows=>[...rows,''])}>+ إضافة محطة</button>
    <button className="primary-button" disabled={busy||!routeVehicle||customers.length===0}>إنشاء الجولة</button>
   </form>
  </div>}
  <div className="distribution-subpanel"><h4>الجولات النشيطة</h4><p className="hint">توثيق المحطة كيسجل نتيجة الزيارة واسم المستلم فقط؛ إصدار فاتورة وخصم مخزون التسليم كيبقى من شاشة الطلبات والتسليم.</p>
   {driverRoutes.length===0?<p className="hint">ما كايناش جولات مسجلة.</p>:driverRoutes.map(route=><article className="team-row" key={route.id}>
    <div><strong>{route.route_code} · {route.name}</strong><span>{route.planned_date} · {route.vehicle_label} · {route.driver_name}</span><span>الحالة: {statusLabel[route.status]} · {route.stop_count} محطة</span>
    {user.role==='delivery_driver'&&route.status==='planned'&&<button type="button" className="primary-button" disabled={busy} onClick={()=>void action(async()=>{const db=await openAppDatabase();await new DistributionRepository(db).startRoute(route.id,user.id);},'بديتي الجولة.')}>بدء الجولة</button>}
    {stops.filter(s=>s.route_id===route.id).map(stop=><div className="route-stop" key={stop.id}><strong>{stop.stop_order}. {stop.customer_name}</strong><span>{statusLabel[stop.status]}</span>
      {user.role==='delivery_driver'&&route.status==='started'&&['pending','arrived'].includes(stop.status)&&<><label>اسم المستلم (للتسليم)<input value={recipient[stop.id]??''} onChange={e=>setRecipient(x=>({...x,[stop.id]:e.target.value}))}/></label><button type="button" className="secondary-button" disabled={busy||!(recipient[stop.id]??'').trim()} onClick={()=>void action(async()=>{const db=await openAppDatabase();await new DistributionRepository(db).recordStop({id:crypto.randomUUID(),stopId:stop.id,driverId:user.id,status:'delivered',recipientName:recipient[stop.id]});},'تسجل إثبات التسليم بالاسم والتوقيت.')}>تأكيد التسليم</button><label>سبب عدم التسليم<input value={failure[stop.id]??''} onChange={e=>setFailure(x=>({...x,[stop.id]:e.target.value}))} placeholder="المحل مغلق، رفض الاستلام..."/></label><button type="button" className="remove-line" disabled={busy||!(failure[stop.id]??'').trim()} onClick={()=>void action(async()=>{const db=await openAppDatabase();await new DistributionRepository(db).recordStop({id:crypto.randomUUID(),stopId:stop.id,driverId:user.id,status:'failed',failureReason:failure[stop.id]});},'تسجل سبب تعذر الزيارة.')}>تسجيل تعذر التسليم</button></>}
    </div>)}
    {user.role==='delivery_driver'&&route.status==='started'&&<button type="button" className="primary-button" disabled={busy||stops.some(s=>s.route_id===route.id&&['pending','arrived'].includes(s.status))} onClick={()=>void action(async()=>{const db=await openAppDatabase();await new DistributionRepository(db).completeRoute(route.id,user.id);},'تسدات الجولة.')}>إغلاق الجولة</button>}
    </div>
   </article>)}
  </div>
  {canManage&&<div className="distribution-subpanel"><h4>حسابات الموردين وأداءاتهم</h4>
   {accounts.map(a=><article className="customer-row" key={a.supplier_id}><div><strong>{a.supplier_name}</strong><span>مشتريات {formatMad(a.purchased_minor)} · أداءات {formatMad(a.paid_minor)} · مرتجعات {formatMad(a.returned_minor)}</span></div><strong>المستحق: {formatMad(a.balance_minor)}</strong></article>)}
   <form onSubmit={e=>{e.preventDefault();void action(recordPayment,'تسجل أداء المورد وتحدث الرصيد.');}}>
    <label>المورد<select required value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">اختار المورد</option>{accounts.filter(a=>a.balance_minor>0).map(a=><option key={a.supplier_id} value={a.supplier_id}>{a.supplier_name} · {formatMad(a.balance_minor)}</option>)}</select></label>
    <div className="two-cols"><label>المبلغ (DH)<input required type="number" min="0.01" step="0.01" value={supplierAmount} onChange={e=>setSupplierAmount(e.target.value)}/></label><label>طريقة الأداء<select value={supplierMethod} onChange={e=>setSupplierMethod(e.target.value as typeof supplierMethod)}><option value="cash">نقداً</option><option value="bank">تحويل بنكي</option><option value="other">أخرى</option></select></label></div>
    <button className="primary-button" disabled={busy||!supplierId}>تسجيل أداء المورد</button>
   </form>
   <div className="section-divider"></div><h4>إرجاع سلعة للمورد</h4>
   <form onSubmit={e=>{e.preventDefault();void action(submitSupplierReturn,'تسجل إرجاع السلعة للمورد وتخصم من مخزون الديبو.');}}>
    <label>المورد<select required value={returnSupplierId} onChange={e=>setReturnSupplierId(e.target.value)}><option value="">اختار المورد</option>{accounts.map(a=><option key={a.supplier_id} value={a.supplier_id}>{a.supplier_name}</option>)}</select></label>
    <label>المنتج<select required value={returnProductId} onChange={e=>{setReturnProductId(e.target.value);const p=products.find(x=>x.id===e.target.value);setReturnUnitCost(((p?.purchase_cost_minor??0)/100).toFixed(2));}}><option value="">اختار المنتج</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="two-cols"><label>الكمية<input type="number" min="0.01" step="0.01" required value={returnQuantity} onChange={e=>setReturnQuantity(e.target.value)}/></label><label>تكلفة الوحدة (DH)<input type="number" min="0" step="0.01" required value={returnUnitCost} onChange={e=>setReturnUnitCost(e.target.value)}/></label></div>
    <label>سبب الإرجاع<input required value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder="تالف، خطأ في التوريد..."/></label>
    <button className="primary-button" disabled={busy||!returnSupplierId||!returnProductId}>تأكيد إرجاع المورد</button>
   </form>
  </div>}
  {user.role==='owner'&&<div className="distribution-subpanel"><h4>سقف الدين حسب الزبون</h4>
   {customers.map(customer=><div className="credit-limit-row" key={customer.id}><strong>{customer.name}</strong><label>السقف (DH)<input type="number" min="0" step="0.01" value={creditLimits[customer.id]??'0'} onChange={e=>setCreditLimits(x=>({...x,[customer.id]:e.target.value}))}/></label><button type="button" className="secondary-button" disabled={busy} onClick={()=>void action(()=>saveLimit(customer.id),'تحدث سقف الدين. 0 كيعني بلا سقف محدد.')}>حفظ</button></div>)}
   <p className="hint">السقف 0 يعني غير محدد. إذا حددتي سقفاً، البيع الجديد بالدين كيرفض تجاوزه.</p>
  </div>}
  {(user.role==='owner'||user.role==='depot_manager')&&<div className="distribution-subpanel"><h4>تقادم ديون الزبناء</h4>
   {aging.filter(a=>a.total_due_minor>0).map(a=><article className="customer-row" key={a.customer_id}><div><strong>{a.customer_name}</strong><span>حالي {formatMad(a.current_minor)} · 1–30 يوم {formatMad(a.days_1_30_minor)} · 31–60 يوم {formatMad(a.days_31_60_minor)} · 61–90 يوم {formatMad(a.days_61_90_minor)} · أكثر من 90 يوم {formatMad(a.over_90_minor)}</span></div><strong>{formatMad(a.total_due_minor)}</strong></article>)}
   {aging.every(a=>a.total_due_minor===0)&&<p className="hint">ما كايناش ديون مستحقة.</p>}
  </div>}
  {user.role==='delivery_driver'&&assignedVehicle&&<div className="distribution-subpanel"><h4>بداية ونهاية يوم السيارة</h4>
   {!vehicleSession?<form onSubmit={e=>{e.preventDefault();void action(startVehicleDay,'تفتحات جلسة يوم السيارة.');}}><label>عداد الكيلومترات عند البداية<input type="number" min="0" step="0.1" value={odometer} onChange={e=>setOdometer(e.target.value)}/></label><label>الصندوق الافتتاحي (DH)<input type="number" min="0" step="0.01" value={openingCash} onChange={e=>setOpeningCash(e.target.value)}/></label><button className="primary-button" disabled={busy}>فتح يوم السيارة</button></form>
   :<form onSubmit={e=>{e.preventDefault();void action(closeVehicleDay,'تسدات جلسة السيارة وتسجل الجرد والمطابقة.');}}><p className="hint">تاريخ الجلسة: {vehicleSession.business_date} · مخزون السيارة الحالي: {counts.length} سطر</p>{counts.map(row=><label key={row.product_id+'|'+row.variant_id+'|'+row.batch_id}>{row.product_name}{row.variant_name?' · '+row.variant_name:''}{row.batch_code?' · '+row.batch_code:''} (المتوقع {row.quantity})<input type="number" min="0" step="0.01" value={countValues[row.product_id+'|'+(row.variant_id??'')+'|'+(row.batch_id??'')]??String(row.quantity)} onChange={e=>setCountValues(x=>({...x,[row.product_id+'|'+(row.variant_id??'')+'|'+(row.batch_id??'')]:e.target.value}))}/></label>)}<label>النقد المعدود عند الإغلاق (DH)<input required type="number" min="0" step="0.01" value={closingCash} onChange={e=>setClosingCash(e.target.value)}/></label><label>عداد الكيلومترات عند الإغلاق<input type="number" min="0" step="0.1" value={closingOdometer} onChange={e=>setClosingOdometer(e.target.value)}/></label><button className="primary-button" disabled={busy}>إغلاق اليوم ومطابقة السيارة</button></form>}
  </div>}
 </section>;
}
