import type { SqliteExecutor } from './sqlite-database';
import { SalesRepository, type CreatedSale } from './sales';

export type PersonalOrderStatus = 'submitted'|'preparing'|'ready'|'partially_delivered'|'delivered'|'cancelled';
export interface PersonalOrderLineInput { productId:string; quantity:number; variantId?:string|null; }
export interface CreatePersonalOrderInput {
  id:string; orderNumber:string; customerId:string; ownerId:string; locationId:string;
  lines:PersonalOrderLineInput[]; discountMinor?:number; note?:string;
}
export interface PersonalDeliveryLine { orderLineId:string; quantity:number; }
export interface PersonalDeliveryInput {
  orderId:string; invoiceId:string; invoiceNumber:string; ownerId:string;
  lines:PersonalDeliveryLine[]; collectedMinor:number; paymentMethod?:'cash'|'bank'|'other';
}
export interface PersonalOrderCreated { orderId:string; orderNumber:string; totalMinor:number; lineCount:number; }
export interface PersonalDeliveryResult { sale:CreatedSale; status:'partially_delivered'|'delivered'; remainingQuantity:number; }
type ProductRow={id:string;name:string;base_unit:string;sale_price_minor:number};
type OrderLineRow={id:string;product_id:string;variant_id:string|null;quantity:number;unit_price_minor:number;remaining_quantity:number};

export function availableUnreservedQuantity(onHand:number,reserved:number):number {
  if(!Number.isFinite(onHand)||!Number.isFinite(reserved)||onHand<0||reserved<0)throw new RangeError('كمية المخزون أو الحجز غير صالحة.');
  return Math.max(0,onHand-reserved);
}
export function personalOrderTransitionAllowed(current:PersonalOrderStatus,next:PersonalOrderStatus):boolean {
  const transitions:Record<PersonalOrderStatus,readonly PersonalOrderStatus[]> = {
    submitted:['preparing','cancelled'], preparing:['ready','cancelled'],
    ready:['partially_delivered','delivered'], partially_delivered:['delivered','cancelled'],
    delivered:[],cancelled:[],
  };
  return transitions[current].includes(next);
}

function required(value:string,label:string):string { const clean=value.trim();if(!clean)throw new Error(label+' مطلوب.');return clean; }
function money(value:number,label:string):number { if(!Number.isSafeInteger(value)||value<0)throw new RangeError(label+' غير صالح.');return value; }

/** Single-owner order flow: reserve depot stock now; create invoices and deduct stock only for delivered quantities. */
export class PersonalOrdersRepository {
  constructor(private readonly db:SqliteExecutor,private readonly now:()=>string=()=>new Date().toISOString(),private readonly makeId:()=>string=()=>crypto.randomUUID()) {}

  async create(input:CreatePersonalOrderInput):Promise<PersonalOrderCreated> {
    const id=required(input.id,'معرّف الطلب'),number=required(input.orderNumber,'رقم الطلب');
    const customerId=required(input.customerId,'الزبون'),ownerId=required(input.ownerId,'المالك'),locationId=required(input.locationId,'المستودع');
    if(!Array.isArray(input.lines)||input.lines.length===0)throw new Error('الطلب خاصو يحتوي على منتج واحد على الأقل.');
    if(new Set(input.lines.map(x=>x.productId+'|'+(x.variantId??''))).size!==input.lines.length)throw new Error('جمع الكمية ديال نفس المنتج فسطر واحد.');
    const discount=money(input.discountMinor??0,'التخفيض'),timestamp=this.now();
    const lines:Array<{product:ProductRow;quantity:number;variantId:string|null;lineTotal:number}>=[];
    let subtotal=0;
    for(const line of input.lines){
      if(!Number.isFinite(line.quantity)||line.quantity<=0)throw new RangeError('الكمية خاصها تكون أكبر من صفر.');
      const found=await this.db.query('SELECT id,name,base_unit,sale_price_minor FROM products WHERE id=? AND is_active=1',[required(line.productId,'المنتج')]);
      const product=found.values?.[0] as ProductRow|undefined;if(!product)throw new Error('المنتج غير موجود أو غير نشيط.');
      const variantId=line.variantId?.trim()||null;
      const stock=await this.db.query('SELECT COALESCE(SUM(quantity),0) AS quantity FROM stock_balances WHERE product_id=? AND variant_id IS ? AND location_id=?',[product.id,variantId,locationId]);
      const reserved=await this.db.query("SELECT COALESCE(SUM(quantity-fulfilled_quantity),0) AS quantity FROM sales_order_reservations WHERE product_id=? AND variant_id IS ? AND location_id=? AND status='active'",[product.id,variantId,locationId]);
      if(availableUnreservedQuantity(Number(stock.values?.[0]?.quantity??0),Number(reserved.values?.[0]?.quantity??0))+1e-9<line.quantity)throw new Error('المخزون المتاح بعد الحجوزات غير كافٍ للمنتج: '+product.name);
      const lineTotal=Math.round(line.quantity*Number(product.sale_price_minor));
      if(!Number.isSafeInteger(lineTotal))throw new RangeError('قيمة الطلب كبيرة بزاف.');
      subtotal+=lineTotal;if(!Number.isSafeInteger(subtotal))throw new RangeError('إجمالي الطلب كبير بزاف.');
      lines.push({product,quantity:line.quantity,variantId,lineTotal});
    }
    if(discount>subtotal)throw new RangeError('التخفيض ما يقدرش يفوت مجموع الطلب.');
    const total=subtotal-discount;
    await this.db.beginTransaction();
    try{
      const customer=await this.db.query('SELECT id FROM customers WHERE id=? AND is_active=1',[customerId]);
      if(!customer.values?.length)throw new Error('الزبون غير موجود أو غير نشيط.');
      // Recheck stock while holding the transaction to avoid reserving the same units twice.
      for(const line of lines){
        const stock=await this.db.query('SELECT COALESCE(SUM(quantity),0) AS quantity FROM stock_balances WHERE product_id=? AND variant_id IS ? AND location_id=?',[line.product.id,line.variantId,locationId]);
        const reserved=await this.db.query("SELECT COALESCE(SUM(quantity-fulfilled_quantity),0) AS quantity FROM sales_order_reservations WHERE product_id=? AND variant_id IS ? AND location_id=? AND status='active'",[line.product.id,line.variantId,locationId]);
        if(availableUnreservedQuantity(Number(stock.values?.[0]?.quantity??0),Number(reserved.values?.[0]?.quantity??0))+1e-9<line.quantity)throw new Error('تبدل المخزون المتاح؛ حدّث الطلب قبل الحفظ: '+line.product.name);
      }
      await this.db.run("INSERT INTO sales_orders (id,order_number,customer_id,created_by,assigned_vehicle_id,status,subtotal_minor,offer_discount_minor,total_minor,notes,created_at,updated_at) VALUES (?,?,?,?,NULL,'submitted',?,?,?,?,?,?)",[id,number,customerId,ownerId,subtotal,discount,total,input.note?.trim()||null,timestamp,timestamp]);
      for(const line of lines){
        const lineId=this.makeId();
        await this.db.run('INSERT INTO sales_order_lines (id,order_id,product_id,variant_id,quantity,unit_price_minor,line_total_minor,product_name_snapshot,unit_snapshot) VALUES (?,?,?,?,?,?,?,?,?)',[lineId,id,line.product.id,line.variantId,line.quantity,Number(line.product.sale_price_minor),line.lineTotal,line.product.name,line.product.base_unit]);
        await this.db.run("INSERT INTO sales_order_reservations (id,order_id,order_line_id,product_id,variant_id,location_id,quantity,fulfilled_quantity,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,'active',?,?)",[this.makeId(),id,lineId,line.product.id,line.variantId,locationId,line.quantity,timestamp,timestamp]);
      }
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[this.makeId(),ownerId,'personal_order.created','sales_order',id,JSON.stringify({number,subtotal,discount,total,lineCount:lines.length}),timestamp]);
      await this.db.commitTransaction();
      return {orderId:id,orderNumber:number,totalMinor:total,lineCount:lines.length};
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async advance(orderId:string,next:PersonalOrderStatus,ownerId:string):Promise<void>{
    const timestamp=this.now();await this.db.beginTransaction();
    try{
      const found=await this.db.query('SELECT status FROM sales_orders WHERE id=?',[required(orderId,'الطلب')]);
      const current=found.values?.[0]?.status as PersonalOrderStatus|undefined;
      if(!current)throw new Error('الطلب غير موجود.');
      if(!personalOrderTransitionAllowed(current,next))throw new Error('مرحلة الطلب غير صالحة.');
      await this.db.run('UPDATE sales_orders SET status=?,updated_at=? WHERE id=? AND status=?',[next,timestamp,orderId,current]);
      if(next==='cancelled')await this.db.run("UPDATE sales_order_reservations SET status='released',updated_at=? WHERE order_id=? AND status='active'",[timestamp,orderId]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[this.makeId(),ownerId,'personal_order.status_changed','sales_order',orderId,JSON.stringify({from:current,to:next}),timestamp]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async deliver(input:PersonalDeliveryInput):Promise<PersonalDeliveryResult>{
    const ownerId=required(input.ownerId,'المالك'),orderId=required(input.orderId,'الطلب');
    if(!Array.isArray(input.lines)||input.lines.length===0)throw new Error('دخل كمية مسلّمة واحدة على الأقل.');
    const collected=money(input.collectedMinor,'المبلغ المؤدى'),timestamp=this.now();
    await this.db.beginTransaction();
    try{
      const orderResult=await this.db.query('SELECT customer_id,status,subtotal_minor,offer_discount_minor,total_minor FROM sales_orders WHERE id=?',[orderId]);
      const order=orderResult.values?.[0];if(!order)throw new Error('الطلب غير موجود.');
      const status=String(order.status) as PersonalOrderStatus;
      if(status!=='ready'&&status!=='partially_delivered')throw new Error('الطلب خاصو يكون واجد قبل تأكيد التسليم.');
      const rows=await this.db.query(`SELECT sol.id,sol.product_id,sol.variant_id,sol.quantity,sol.unit_price_minor,
        MAX(0,sol.quantity-COALESCE((SELECT SUM(il.quantity) FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
          WHERE i.order_id=sol.order_id AND il.product_id=sol.product_id AND il.variant_id IS sol.variant_id AND i.status<>'voided'),0)) AS remaining_quantity
        FROM sales_order_lines sol WHERE sol.order_id=? ORDER BY sol.rowid`,[orderId]);
      const orderLines=(rows.values??[]) as unknown as OrderLineRow[];
      const selected= input.lines.map(item=>{
        const line=orderLines.find(row=>row.id===item.orderLineId);
        if(!line||!Number.isFinite(item.quantity)||item.quantity<=0||item.quantity>Number(line.remaining_quantity)+1e-9)throw new Error('راجع كميات التسليم؛ ما يمكنش تتجاوز الكمية المتبقية.');
        return {line,quantity:item.quantity};
      });
      if(new Set(input.lines.map(x=>x.orderLineId)).size!==input.lines.length)throw new Error('ما تكررش نفس السطر فالتسليم.');
      const gross=selected.reduce((sum,item)=>sum+Math.round(item.quantity*Number(item.line.unit_price_minor)),0);
      const invoiced=await this.db.query(`SELECT COALESCE(SUM(total_minor+offer_discount_minor),0) AS gross,COALESCE(SUM(offer_discount_minor),0) AS discount FROM invoices WHERE order_id=? AND status<>'voided'`,[orderId]);
      const remainingGross=Math.max(0,Number(order.subtotal_minor)-Number(invoiced.values?.[0]?.gross??0));
      const remainingDiscount=Math.max(0,Number(order.offer_discount_minor)-Number(invoiced.values?.[0]?.discount??0));
      const isFinal=selected.every(({line,quantity})=>quantity>=Number(line.remaining_quantity)-1e-9)&&orderLines.every(line=>selected.some(item=>item.line.id===line.id)||Number(line.remaining_quantity)<=1e-9);
      const discount=isFinal?remainingDiscount:Math.min(remainingDiscount,Math.round(remainingDiscount*gross/Math.max(1,remainingGross)));
      const sale=await new SalesRepository(this.db,this.now,this.makeId).create({
        id:input.invoiceId,invoiceNumber:input.invoiceNumber,customerId:String(order.customer_id),sellerUserId:ownerId,
        locationId:deliveryLocationId??'loc-depot-main',orderId,lines:selected.map(item=>({productId:item.line.product_id,variantId:item.line.variant_id,quantity:item.quantity,unitPriceMinor:Number(item.line.unit_price_minor)})),
        discountMinor:discount,collectedMinor:collected,paymentMethod:input.paymentMethod??'cash',note:'تأكيد تسليم الطلب '+input.orderId,
      },'external');
      let deliveryLocationId:string|null=null;
      for(const item of selected){
        const reservation=await this.db.query("SELECT id,quantity,fulfilled_quantity,location_id FROM sales_order_reservations WHERE order_line_id=? AND status='active'",[item.line.id]);
        const row=reservation.values?.[0];if(!row)throw new Error('حجز المخزون غير موجود لهذا السطر.');
        const reservedLocation=String(row.location_id??'');
        if(!reservedLocation||(deliveryLocationId&&deliveryLocationId!==reservedLocation))throw new Error('موقع المخزون مختلف بين أسطر الطلب؛ راجع الحجوزات قبل التسليم.');
        deliveryLocationId=reservedLocation;
        const fulfilled=Number(row.fulfilled_quantity)+item.quantity,quantity=Number(row.quantity);
        if(fulfilled>quantity+1e-9)throw new Error('كمية التسليم تجاوزت الحجز.');
        await this.db.run("UPDATE sales_order_reservations SET fulfilled_quantity=?,status=?,updated_at=? WHERE id=?",[fulfilled,fulfilled>=quantity-1e-9?'consumed':'active',timestamp,row.id]);
      }
      const pending=await this.db.query(`SELECT COUNT(*) AS count FROM sales_order_lines sol
        WHERE sol.order_id=? AND sol.quantity>COALESCE((SELECT SUM(il.quantity) FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
          WHERE i.order_id=sol.order_id AND il.product_id=sol.product_id AND il.variant_id IS sol.variant_id AND i.status<>'voided'),0)+0.000000001`,[orderId]);
      const remaining=await this.db.query('SELECT COALESCE(SUM(quantity-fulfilled_quantity),0) AS quantity FROM sales_order_reservations WHERE order_id=? AND status=\'active\'',[orderId]);
      const next=Number(pending.values?.[0]?.count??0)===0?'delivered':'partially_delivered';
      await this.db.run('UPDATE sales_orders SET status=?,updated_at=? WHERE id=?',[next,timestamp,orderId]);
      await this.db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[this.makeId(),ownerId,next==='delivered'?'personal_order.delivered':'personal_order.partially_delivered','sales_order',orderId,JSON.stringify({invoiceId:sale.invoiceId,invoiceNumber:sale.invoiceNumber,remainingQuantity:Number(remaining.values?.[0]?.quantity??0)}),timestamp]);
      await this.db.commitTransaction();
      return {sale,status:next,remainingQuantity:Number(remaining.values?.[0]?.quantity??0)};
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }
}
