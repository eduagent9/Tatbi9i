import type { SqliteExecutor } from './sqlite-database';

export type RouteStopStatus = 'pending'|'arrived'|'partially_delivered'|'delivered'|'failed'|'skipped';
export interface RouteStopInput { id:string; customerId:string; orderId?:string|null; stopOrder:number; plannedAt?:string|null; }
export interface CreateRouteInput {
  id:string; code:string; name:string; plannedDate:string; vehicleId:string; driverUserId:string;
  createdBy:string; stops:RouteStopInput[];
}
export interface SupplierAccountRow {
  supplier_id:string; supplier_name:string; purchased_minor:number;
  paid_minor:number; returned_minor:number; balance_minor:number;
}
export interface CustomerAgingRow {
  customer_id:string; customer_name:string; current_minor:number;
  days_1_30_minor:number; days_31_60_minor:number; days_61_90_minor:number;
  over_90_minor:number; total_due_minor:number;
}
export interface VehicleDayInput {
  id:string; vehicleId:string; responsibleUserId:string; businessDate:string;
  openingOdometer?:number|null; openingCashMinor?:number; expectedCashMinor?:number;
}
export interface VehicleCountInput { productId:string; variantId?:string|null; batchId?:string|null; countedQuantity:number; }
const required=(v:string,label:string)=>{const x=v.trim();if(!x)throw new Error(label+' مطلوب.');return x;};
const positiveMoney=(v:number,label:string)=>{if(!Number.isSafeInteger(v)||v<=0)throw new RangeError(label+' خاصو يكون مبلغاً صحيحاً موجباً بالسنتيم.');return v;};
const quantity=(v:number,label:string)=>{if(!Number.isFinite(v)||v<0)throw new RangeError(label+' خاصها تكون كمية صحيحة غير سالبة.');return v;};

/** Transactional route, vehicle-day and supplier-account operations. No remote sync is implied. */
export class DistributionRepository {
  constructor(
    private readonly db:SqliteExecutor,
    private readonly now:()=>string=()=>new Date().toISOString(),
    private readonly makeId:()=>string=()=>crypto.randomUUID(),
  ) {}

  async createRoute(input:CreateRouteInput):Promise<void>{
    const id=required(input.id,'معرّف الجولة'),code=required(input.code,'رقم الجولة');
    const vehicleId=required(input.vehicleId,'سيارة التوصيل'),driverId=required(input.driverUserId,'السائق');
    const creator=required(input.createdBy,'منشئ الجولة'),name=required(input.name,'اسم الجولة');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.plannedDate))throw new Error('تاريخ الجولة غير صالح.');
    if(!Array.isArray(input.stops)||input.stops.length===0)throw new Error('الجولة خاصها محطة واحدة على الأقل.');
    const sorted=[...input.stops].sort((a,b)=>a.stopOrder-b.stopOrder);
    if(new Set(sorted.map(s=>s.customerId)).size!==sorted.length)throw new Error('ما تكررش نفس الزبون فالجولة.');
    if(sorted.some((s,i)=>!Number.isSafeInteger(s.stopOrder)||s.stopOrder!==i+1))throw new Error('ترتيب المحطات خاصو يكون متسلسلاً من 1.');
    const timestamp=this.now();
    await this.db.beginTransaction();
    try{
      const vehicle=await this.db.query("SELECT v.id,v.vehicle_type,v.assigned_user_id,u.role,u.is_active FROM vehicles v LEFT JOIN users u ON u.id=v.assigned_user_id WHERE v.id=? AND v.is_active=1",[vehicleId]);
      const v=vehicle.values?.[0];
      if(!v||String(v.vehicle_type)!=='delivery')throw new Error('اختار سيارة توصيل نشيطة.');
      if(String(v.assigned_user_id??'')!==driverId||String(v.role)!=='delivery_driver'||Number(v.is_active)!==1)throw new Error('السائق خاصو يكون هو المعيّن حالياً لسيارة التوصيل.');
      await this.db.run(
        "INSERT INTO delivery_routes (id,route_code,name,planned_date,vehicle_id,driver_user_id,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'planned',?,?,?)",
        [id,code,name,input.plannedDate,vehicleId,driverId,creator,timestamp,timestamp],
      );
      for(const stop of sorted){
        const customer=await this.db.query('SELECT id FROM customers WHERE id=? AND is_active=1',[required(stop.customerId,'الزبون')]);
        if(!customer.values?.length)throw new Error('كاين زبون غير نشيط أو غير موجود فالمحطات.');
        if(stop.orderId){
          const order=await this.db.query("SELECT id,customer_id,assigned_vehicle_id,status FROM sales_orders WHERE id=?",[stop.orderId]);
          const o=order.values?.[0];
          if(!o||String(o.customer_id)!==stop.customerId||!['ready','partially_delivered'].includes(String(o.status)))throw new Error('الطلب المرتبط بالمحطة غير جاهز أو لا يخص هذا الزبون.');
          if(o.assigned_vehicle_id&&String(o.assigned_vehicle_id)!==vehicleId)throw new Error('الطلب معيّن لسيارة توصيل أخرى.');
        }
        await this.db.run('INSERT INTO delivery_route_stops (id,route_id,stop_order,customer_id,order_id,status,planned_at) VALUES (?,?,?,?,?,?,?)',[stop.id,id,stop.stopOrder,stop.customerId,stop.orderId??null,'pending',stop.plannedAt??null]);
      }
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[this.makeId(),creator,'route.created','delivery_route',id,JSON.stringify({code,vehicleId,driverId,stops:sorted.length}),timestamp]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async startRoute(routeId:string,actorId:string):Promise<void>{
    const now=this.now();await this.db.beginTransaction();
    try{
      const route=await this.db.query("SELECT id,status,driver_user_id FROM delivery_routes WHERE id=?",[required(routeId,'الجولة')]);
      const row=route.values?.[0];
      if(!row||String(row.status)!=='planned')throw new Error('الجولة ما بقاتش فحالة مخططة.');
      if(String(row.driver_user_id)!==actorId)throw new Error('غير السائق المعيّن يقدر يبدا الجولة.');
      await this.db.run("UPDATE delivery_routes SET status='started',started_at=?,updated_at=? WHERE id=? AND status='planned'",[now,now,routeId]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,occurred_at) VALUES (?,?,?,?,?,?)',[this.makeId(),actorId,'route.started','delivery_route',routeId,now]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async recordStop(input:{id:string;stopId:string;driverId:string;status:RouteStopStatus;recipientName?:string;signatureUri?:string;photoUri?:string;latitude?:number|null;longitude?:number|null;note?:string;failureReason?:string}):Promise<void>{
    const now=this.now();if(input.latitude!=null&&(!Number.isFinite(input.latitude)||input.latitude < -90||input.latitude>90))throw new RangeError('خط العرض غير صالح.');
    if(input.longitude!=null&&(!Number.isFinite(input.longitude)||input.longitude < -180||input.longitude>180))throw new RangeError('خط الطول غير صالح.');
    if(['delivered','partially_delivered'].includes(input.status)&&!input.recipientName?.trim()&&!input.signatureUri?.trim())throw new Error('التسليم خاصو اسم المستلم أو توقيع.');
    if(['failed','skipped'].includes(input.status)&&!input.failureReason?.trim())throw new Error('سجل سبب عدم إتمام الزيارة.');
    await this.db.beginTransaction();
    try{
      const found=await this.db.query("SELECT s.id,s.route_id,s.order_id,s.status,r.driver_user_id,r.status AS route_status FROM delivery_route_stops s JOIN delivery_routes r ON r.id=s.route_id WHERE s.id=?",[input.stopId]);
      const stop=found.values?.[0];
      if(!stop||String(stop.driver_user_id)!==input.driverId||String(stop.route_status)!=='started')throw new Error('المحطة ماشي ضمن جولة نشيطة ديالك.');
      if(!['pending','arrived'].includes(String(stop.status)))throw new Error('المحطة تسجلات من قبل؛ ما يمكنش نعاودو نسجلوها.');
      await this.db.run('INSERT INTO delivery_proofs (id,route_stop_id,order_id,driver_user_id,result,recipient_name,signature_local_uri,photo_local_uri,latitude,longitude,note,captured_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[input.id,input.stopId,stop.order_id??null,input.driverId,input.status,input.recipientName?.trim()||null,input.signatureUri??null,input.photoUri??null,input.latitude??null,input.longitude??null,input.note?.trim()||null,now,now]);
      await this.db.run('UPDATE delivery_route_stops SET status=?,completed_at=?,failure_reason=?,notes=? WHERE id=?',[input.status,now,input.failureReason?.trim()||null,input.note?.trim()||null,input.stopId]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[this.makeId(),input.driverId,'route.stop_recorded','delivery_route_stop',input.stopId,JSON.stringify({status:input.status,proofId:input.id}),now]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async completeRoute(routeId:string,driverId:string):Promise<void>{
    const now=this.now();await this.db.beginTransaction();
    try{
      const result=await this.db.query('SELECT status,driver_user_id FROM delivery_routes WHERE id=?',[routeId]);
      const row=result.values?.[0];if(!row||String(row.status)!=='started'||String(row.driver_user_id)!==driverId)throw new Error('الجولة غير نشيطة أو غير معيّنة ليك.');
      const pending=await this.db.query("SELECT COUNT(*) AS count FROM delivery_route_stops WHERE route_id=? AND status IN ('pending','arrived')",[routeId]);
      if(Number(pending.values?.[0]?.count??0)>0)throw new Error('باقي محطات ما تسجلاتش؛ سجل التسليم أو سبب عدم الزيارة قبل الإغلاق.');
      await this.db.run("UPDATE delivery_routes SET status='completed',completed_at=?,updated_at=? WHERE id=? AND status='started'",[now,now,routeId]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,occurred_at) VALUES (?,?,?,?,?,?)',[this.makeId(),driverId,'route.completed','delivery_route',routeId,now]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async listSupplierAccounts():Promise<SupplierAccountRow[]>{
    const result=await this.db.query(`SELECT s.id AS supplier_id,s.name AS supplier_name,
      COALESCE((SELECT SUM(pr.total_minor) FROM purchase_receipts pr WHERE pr.supplier_id=s.id),0) AS purchased_minor,
      COALESCE((SELECT SUM(sp.amount_minor) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0) AS paid_minor,
      COALESCE((SELECT SUM(sr.total_minor) FROM supplier_returns sr WHERE sr.supplier_id=s.id),0) AS returned_minor,
      MAX(0,COALESCE((SELECT SUM(pr.total_minor) FROM purchase_receipts pr WHERE pr.supplier_id=s.id),0)
        -COALESCE((SELECT SUM(sp.amount_minor) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0)
        -COALESCE((SELECT SUM(sr.total_minor) FROM supplier_returns sr WHERE sr.supplier_id=s.id),0)) AS balance_minor
      FROM suppliers s ORDER BY s.name COLLATE NOCASE`);
    return (result.values??[]) as unknown as SupplierAccountRow[];
  }

  async recordSupplierPayment(input:{id:string;supplierId:string;purchaseReceiptId?:string|null;amountMinor:number;method:'cash'|'bank'|'other';paidBy:string;referenceNumber?:string;note?:string}):Promise<void>{
    const amount=positiveMoney(input.amountMinor,'مبلغ أداء المورد'),supplierId=required(input.supplierId,'المورد'),paidBy=required(input.paidBy,'المستخدم');
    if(!['cash','bank','other'].includes(input.method))throw new Error('طريقة الأداء غير صالحة.');
    const now=this.now();await this.db.beginTransaction();
    try{
      const supplier=await this.db.query('SELECT id FROM suppliers WHERE id=?',[supplierId]);if(!supplier.values?.length)throw new Error('المورد غير موجود.');
      let receiptId=input.purchaseReceiptId??null;
      let due:number;
      if(receiptId){
        const receipt=await this.db.query('SELECT id,total_minor FROM purchase_receipts WHERE id=? AND supplier_id=?',[receiptId,supplierId]);
        if(!receipt.values?.length)throw new Error('وصل الشراء لا يخص المورد المختار.');
        const paid=await this.db.query('SELECT COALESCE(SUM(amount_minor),0) AS amount FROM supplier_payments WHERE purchase_receipt_id=?',[receiptId]);
        const returned=await this.db.query('SELECT COALESCE(SUM(total_minor),0) AS amount FROM supplier_returns WHERE purchase_receipt_id=?',[receiptId]);
        due=Math.max(0,Number(receipt.values[0].total_minor)-Number(paid.values?.[0]?.amount??0)-Number(returned.values?.[0]?.amount??0));
      }else{
        const rows=await this.db.query(`SELECT
          COALESCE((SELECT SUM(total_minor) FROM purchase_receipts WHERE supplier_id=?),0)-
          COALESCE((SELECT SUM(amount_minor) FROM supplier_payments WHERE supplier_id=?),0)-
          COALESCE((SELECT SUM(total_minor) FROM supplier_returns WHERE supplier_id=?),0) AS due`,[supplierId,supplierId,supplierId]);
        due=Math.max(0,Number(rows.values?.[0]?.due??0));
      }
      if(amount>due)throw new Error('مبلغ الأداء كيتجاوز الدين المستحق للمورد.');
      await this.db.run('INSERT INTO supplier_payments (id,supplier_id,purchase_receipt_id,amount_minor,method,reference_number,paid_by,paid_at,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[required(input.id,'معرّف الأداء'),supplierId,receiptId,amount,input.method,input.referenceNumber?.trim()||null,paidBy,now,input.note?.trim()||null,now]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[this.makeId(),paidBy,'supplier.payment_recorded','supplier',supplierId,JSON.stringify({amountMinor:amount,receiptId,method:input.method}),now]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async listCustomerAging():Promise<CustomerAgingRow[]>{
    const result=await this.db.query(`SELECT c.id AS customer_id,c.name AS customer_name,
      COALESCE(SUM(CASE WHEN julianday('now')-julianday(COALESCE(i.confirmed_at,i.created_at))<=0 THEN i.total_minor-i.collected_minor ELSE 0 END),0) AS current_minor,
      COALESCE(SUM(CASE WHEN julianday('now')-julianday(COALESCE(i.confirmed_at,i.created_at)) BETWEEN 1 AND 30 THEN i.total_minor-i.collected_minor ELSE 0 END),0) AS days_1_30_minor,
      COALESCE(SUM(CASE WHEN julianday('now')-julianday(COALESCE(i.confirmed_at,i.created_at)) BETWEEN 31 AND 60 THEN i.total_minor-i.collected_minor ELSE 0 END),0) AS days_31_60_minor,
      COALESCE(SUM(CASE WHEN julianday('now')-julianday(COALESCE(i.confirmed_at,i.created_at)) BETWEEN 61 AND 90 THEN i.total_minor-i.collected_minor ELSE 0 END),0) AS days_61_90_minor,
      COALESCE(SUM(CASE WHEN julianday('now')-julianday(COALESCE(i.confirmed_at,i.created_at))>90 THEN i.total_minor-i.collected_minor ELSE 0 END),0) AS over_90_minor,
      COALESCE(SUM(i.total_minor-i.collected_minor),0) AS total_due_minor
      FROM customers c LEFT JOIN invoices i ON i.customer_id=c.id AND i.confirmed_at IS NOT NULL AND i.status NOT IN ('returned','voided') AND i.total_minor>i.collected_minor
      WHERE c.is_active=1 GROUP BY c.id ORDER BY total_due_minor DESC`);
    return (result.values??[]) as unknown as CustomerAgingRow[];
  }

  async setCustomerCreditLimit(customerId:string,limitMinor:number,actorId:string):Promise<void>{
    if(!Number.isSafeInteger(limitMinor)||limitMinor<0)throw new RangeError('سقف الدين خاصو يكون مبلغاً صحيحاً غير سالب بالسنتيم.');
    const now=this.now();await this.db.beginTransaction();
    try{
      const found=await this.db.query('SELECT credit_limit_minor FROM customers WHERE id=? AND is_active=1',[customerId]);
      if(!found.values?.length)throw new Error('الزبون غير موجود أو غير نشيط.');
      const previous=Number(found.values[0].credit_limit_minor??0);
      await this.db.run('UPDATE customers SET credit_limit_minor=?,updated_at=? WHERE id=?',[limitMinor,now,customerId]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,before_json,after_json,occurred_at) VALUES (?,?,?,?,?,?,?,?)',[this.makeId(),actorId,'customer.credit_limit_changed','customer',customerId,JSON.stringify({creditLimitMinor:previous}),JSON.stringify({creditLimitMinor:limitMinor}),now]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async startVehicleDay(input:VehicleDayInput):Promise<void>{
    const openingCash= input.openingCashMinor??0,expectedCash=input.expectedCashMinor??0;if(!Number.isSafeInteger(openingCash)||openingCash<0||!Number.isSafeInteger(expectedCash)||expectedCash<0)throw new RangeError('رصيد الصندوق غير صالح.');
    if(input.openingOdometer!=null&&(!Number.isFinite(input.openingOdometer)||input.openingOdometer<0))throw new RangeError('عداد الكيلومترات غير صالح.');
    const now=this.now();await this.db.beginTransaction();
    try{
      const vehicle=await this.db.query("SELECT id,vehicle_type,assigned_user_id FROM vehicles WHERE id=? AND is_active=1",[input.vehicleId]);
      const v=vehicle.values?.[0];if(!v||String(v.vehicle_type)!=='delivery'||String(v.assigned_user_id)!==input.responsibleUserId)throw new Error('السيارة ماشي سيارة توصيل معيّنة لهذا المستخدم.');
      await this.db.run("INSERT INTO vehicle_day_sessions (id,vehicle_id,responsible_user_id,business_date,opening_odometer,opening_cash_minor,expected_cash_minor,status,opened_at) VALUES (?,?,?,?,?,?,?,'open',?)",[input.id,input.vehicleId,input.responsibleUserId,input.businessDate,input.openingOdometer??null,openingCash,expectedCash,now]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[this.makeId(),input.responsibleUserId,'vehicle.day_opened','vehicle_day_session',input.id,JSON.stringify({businessDate:input.businessDate,openingCashMinor:openingCash,expectedCashMinor:expectedCash,openingOdometer:input.openingOdometer??null}),now]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async closeVehicleDay(input:{sessionId:string;responsibleUserId:string;closingOdometer?:number|null;countedCashMinor:number;counts:VehicleCountInput[]}):Promise<{cashDifferenceMinor:number;stockVariances:number}>{
    if(!Number.isSafeInteger(input.countedCashMinor)||input.countedCashMinor<0)throw new RangeError('النقد المعدود غير صالح.');
    if(input.closingOdometer!=null&&(!Number.isFinite(input.closingOdometer)||input.closingOdometer<0))throw new RangeError('عداد الكيلومترات غير صالح.');
    const now=this.now();await this.db.beginTransaction();
    try{
      const found=await this.db.query("SELECT id,vehicle_id,opening_odometer,opening_cash_minor,expected_cash_minor,status FROM vehicle_day_sessions WHERE id=? AND responsible_user_id=?",[input.sessionId,input.responsibleUserId]);
      const session=found.values?.[0];if(!session||String(session.status)!=='open')throw new Error('جلسة السيارة ماشي مفتوحة أو ماشي ديالك.');
      if(input.closingOdometer!=null&&session.opening_odometer!=null&&input.closingOdometer<Number(session.opening_odometer))throw new Error('عداد الإغلاق ما يقدرش يكون أقل من عداد البداية.');
      const location=await this.db.query("SELECT id FROM stock_locations WHERE vehicle_id=? AND location_type='vehicle' AND is_active=1",[session.vehicle_id]);
      const locationId=location.values?.[0]?.id;if(!locationId)throw new Error('موقع مخزون السيارة غير موجود.');
      const expected=await this.db.query('SELECT product_id,variant_id,batch_id,quantity FROM stock_balances WHERE location_id=? AND quantity>0',[locationId]);
      const submitted=new Map<string,number>();
      for(const count of input.counts){
        const key=count.productId+'|'+(count.variantId??'')+'|'+(count.batchId??'');
        if(submitted.has(key))throw new Error('كاين تكرار لنفس المنتج والدفعة فالجرد.');
        submitted.set(key,quantity(count.countedQuantity,'الكمية المعدودة'));
      }
      const expectedKeys=new Set((expected.values??[]).map(row=>String(row.product_id)+'|'+String(row.variant_id??'')+'|'+String(row.batch_id??'')));
      for(const key of expectedKeys)if(!submitted.has(key))throw new Error('خاصك تدخل العد الفعلي لجميع المنتجات والدفعات اللي عندها رصيد.');
      for(const key of submitted.keys())if(!expectedKeys.has(key))throw new Error('كاين منتج أو دفعة فالجرد ما عندهاش رصيد متوقع فالسيارة.');
      let varianceCount=0;
      for(const row of expected.values??[]){
        const key=String(row.product_id)+'|'+String(row.variant_id??'')+'|'+String(row.batch_id??''),counted=submitted.get(key)!;
        const expectedQty=Number(row.quantity),variance=counted-expectedQty;
        if(Math.abs(variance)>1e-9)varianceCount++;
        await this.db.run('INSERT INTO vehicle_stock_counts_v2 (id,session_id,product_id,variant_id,batch_id,expected_quantity,counted_quantity,variance_quantity,counted_at) VALUES (?,?,?,?,?,?,?,?,?)',[this.makeId(),input.sessionId,row.product_id,row.variant_id??null,row.batch_id??null,expectedQty,counted,variance,now]);
        if(Math.abs(variance)>1e-9){
          const balance=await this.db.query('SELECT id FROM stock_balances WHERE product_id=? AND variant_id IS ? AND location_id=? AND batch_id IS ?',[row.product_id,row.variant_id??null,locationId,row.batch_id??null]);
          if(!balance.values?.[0])throw new Error('رصيد المخزون تبدل أثناء الجرد؛ عاود تحديث الشاشة.');
          await this.db.run('UPDATE stock_balances SET quantity=?,updated_at=? WHERE id=?',[counted,now,balance.values[0].id]);
          await this.db.run("INSERT INTO stock_movements (id,product_id,batch_id,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,performed_by,responsible_user_id,occurred_at,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",[this.makeId(),row.product_id,row.batch_id??null,locationId,locationId,Math.abs(variance),'stock_count','vehicle_day_session',input.sessionId,input.responsibleUserId,input.responsibleUserId,now,'مطابقة مخزون السيارة: '+variance]);
        }
      }
      const cashDifference=input.countedCashMinor-Number(session.expected_cash_minor);
      await this.db.run("UPDATE vehicle_day_sessions SET closing_odometer=?,counted_cash_minor=?,status='reconciled',closed_at=?,discrepancy_note=? WHERE id=? AND status='open'",[input.closingOdometer??null,input.countedCashMinor,now,cashDifference===0?null:'فرق نقدي: '+cashDifference,input.sessionId]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[this.makeId(),input.responsibleUserId,'vehicle.day_closed','vehicle_day_session',input.sessionId,JSON.stringify({countedCashMinor:input.countedCashMinor,cashDifferenceMinor:cashDifference,stockVariances:varianceCount}),now]);
      await this.db.commitTransaction();
      return {cashDifferenceMinor:cashDifference,stockVariances:varianceCount};
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }
}
