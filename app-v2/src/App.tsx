import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatMad, formatSignedMad, madToMinorUnits } from './data/money';
import { hashPin, isValidPin, verifyPin } from './data/auth';
import { canPerform, type AppPermission } from './data/permissions';
import { getWorkspaceNavigation } from './data/workspace-navigation';
import { canLoadDistributionOrder, canTransitionDistributionOrder } from './data/distribution-workflow';
import { openAppDatabase } from './data/sqlite-database';
import { ProductRepository, type ProductRecord } from './data/products';
import { StockRepository, type ExpiryAlertRow, type StockMovementRecord } from './data/stock';
import { CustomerRepository, type CustomerRecord } from './data/customers';
import { SalesRepository } from './data/sales';
import { PaymentRepository, type OutstandingInvoice } from './data/payments';
import { SupplierRepository, type SupplierRecord } from './data/suppliers';
import { PurchaseRepository } from './data/purchases';
import { ExpenseRepository } from './data/expenses';
import { ReportsRepository, type FinancialSummary } from './data/reports';
import { StockAndReturnsPanel } from './operations/StockAndReturnsPanel';
import { DataBackupPanel } from './operations/DataBackupPanel';
import { DistributionOperationsPanel } from './operations/DistributionOperationsPanel';
import { InvoiceArchivePanel } from './operations/InvoiceArchivePanel';
import { ProductCardPicker } from './operations/ProductCardPicker';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import {translate,type AppLanguage,type TranslationKey} from './data/i18n';
import BrowserPreview from './BrowserPreview';
import { Capacitor } from '@capacitor/core';

const emptyForm = { name: '', category: 'مواد غذائية', subcategory: '', unit: 'piece' as 'piece' | 'carton', pieces: '12', cost: '', price: '', threshold: '0', barcode: '', imageLocalUri: '' };
type DistributionOrderRow = { id:string; order_number:string; customer_name:string; created_by_user_id:string; created_by_name:string; assigned_vehicle_id:string|null; vehicle_label:string|null; status:'draft'|'submitted'|'accepted'|'preparing'|'ready'|'partially_delivered'|'delivered'|'cancelled'; total_minor:number; created_at:string };
type DistributionOrderLine = { id:string; product_id:string; product_name_snapshot:string; variant_id:string|null; quantity:number; unit_price_minor:number; remaining_quantity:number };
type CashSessionRow = { id:string; user_id:string; user_name:string; vehicle_label:string|null; expected_cash_minor:number; handed_cash_minor:number; counted_cash_minor:number|null; discrepancy_reason:string|null; status:'open'|'submitted'|'reconciled' };
type TeamUser = { id:string; display_name:string; phone:string|null; role:'owner'|'depot_manager'|'order_rep'|'van_sales'|'delivery_driver'; is_active:number };
type AuthUser = TeamUser & { pin_salt:string|null; pin_hash:string|null };
type TeamVehicle = { id:string; code:string; label:string; vehicle_type:'van_sales'|'delivery'; assigned_user_id:string|null; assigned_name:string|null };
const roleLabels:Record<TeamUser['role'],TranslationKey>={owner:'owner',depot_manager:'depot_manager',order_rep:'order_rep',van_sales:'van_sales',delivery_driver:'delivery_driver'};

export default function App() {
  const [repository, setRepository] = useState<ProductRepository | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlertRow[]>([]);
  const [movementHistory, setMovementHistory] = useState<StockMovementRecord[]>([]);
  const [distributionOrders,setDistributionOrders]=useState<DistributionOrderRow[]>([]);
  const [orderDeliveryLines,setOrderDeliveryLines]=useState<Record<string,DistributionOrderLine[]>>({});
  const [deliveryQuantities,setDeliveryQuantities]=useState<Record<string,string>>({});
  const [cashSessions,setCashSessions]=useState<CashSessionRow[]>([]);
  const [handoverSessionId,setHandoverSessionId]=useState('');
  const [handoverReceiverId,setHandoverReceiverId]=useState('');
  const [handoverAmount,setHandoverAmount]=useState('');
  const [cashCountedAmounts,setCashCountedAmounts]=useState<Record<string,string>>({});
  const [cashDiscrepancyReasons,setCashDiscrepancyReasons]=useState<Record<string,string>>({});
  const [orderCustomerId,setOrderCustomerId]=useState('');
  const [orderVehicleId,setOrderVehicleId]=useState('');
  const [deliveryCollectedAmounts,setDeliveryCollectedAmounts]=useState<Record<string,string>>({});
  const [orderLines,setOrderLines]=useState<Array<{productId:string;quantity:string}>>([{productId:'',quantity:'1'}]);
  const [teamUsers,setTeamUsers]=useState<TeamUser[]>([]);
  const [authUsers,setAuthUsers]=useState<AuthUser[]>([]);
  const [currentUser,setCurrentUser]=useState<AuthUser|null>(null);
  const [authMode,setAuthMode]=useState<'loading'|'setup'|'login'>('loading');
  const [authUserId,setAuthUserId]=useState('local-owner');
  const [authPin,setAuthPin]=useState('');
  const [setupPin,setSetupPin]=useState('');
  const [setupPinConfirm,setSetupPinConfirm]=useState('');
  const [teamPin,setTeamPin]=useState('');
  const [teamVehicles,setTeamVehicles]=useState<TeamVehicle[]>([]);
  const [teamName,setTeamName]=useState('');
  const [teamPhone,setTeamPhone]=useState('');
  const [teamRole,setTeamRole]=useState<TeamUser['role']>('order_rep');
  const [assignment,setAssignment]=useState<Record<string,string>>({});
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [expenseCategory, setExpenseCategory] = useState('نقل');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplierName, setSupplierName] = useState('');
  const [editingSupplierId,setEditingSupplierId]=useState<string|null>(null);
  const [supplierPhone, setSupplierPhone] = useState('');
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<Array<{productId:string;quantity:string;unitCost:string;batchCode:string;expiryDate:string}>>([{productId:'',quantity:'1',unitCost:'',batchCode:'',expiryDate:''}]);
  const [collectionInvoiceId, setCollectionInvoiceId] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [editingCustomerId,setEditingCustomerId]=useState<string|null>(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleLines, setSaleLines] = useState<Array<{productId:string;quantity:string}>>([{productId:'',quantity:'1'}]);
  const [saleDiscount, setSaleDiscount] = useState('0');
  const [saleCollected, setSaleCollected] = useState('');
  const [lastInvoice, setLastInvoice] = useState<null | {number:string;date:string;customer:string;phone:string|null;city:string|null;seller:string;lines:Array<{name:string;quantity:number;unitPrice:number;total:number}>;subtotal:number;discount:number;total:number;collected:number;due:number}>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingProductId,setEditingProductId]=useState<string|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [stockProductId, setStockProductId] = useState('');
  const [stockQuantity, setStockQuantity] = useState('1');
  const [stockDirection, setStockDirection] = useState<'in' | 'out'>('in');
  const [stockOutType, setStockOutType] = useState<'delivery' | 'damage' | 'supplier_return'>('delivery');
  const [barcodeScanning,setBarcodeScanning]=useState(false);
  const [activeSection,setActiveSection]=useState<'home'|'sales'|'inventory'|'distribution'|'purchases'|'relations'|'management'|'settings'>('home');
  const [language,setLanguage]=useState<AppLanguage>(()=>{const saved=localStorage.getItem('tatbiqi.language');return saved==='fr'||saved==='en'?saved:'ar';});
  useEffect(()=>{localStorage.setItem('tatbiqi.language',language);document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';},[language]);
  const tr=(key:Parameters<typeof translate>[1])=>translate(language,key);
  const workspaceNavigation=currentUser?getWorkspaceNavigation(currentUser.role,tr):[];
  const browserPreview=Capacitor.getPlatform()==='web'&&new URLSearchParams(window.location.search).get('preview')==='1';

  const refresh = useCallback(async (repo: ProductRepository) => setProducts(await repo.list()), []);
  useEffect(() => {
    if(browserPreview){setLoading(false);return;}
    let alive = true;
    openAppDatabase().then(async db => {
      if (!alive) return;
      const repo = new ProductRepository(db);
      setRepository(repo);
      const [usersResult,vehiclesResult]=await Promise.all([
        db.query("SELECT id,display_name,phone,role,is_active,pin_salt,pin_hash FROM users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'depot_manager' THEN 1 ELSE 2 END,display_name"),
        db.query("SELECT v.id,v.code,v.label,v.vehicle_type,v.assigned_user_id,u.display_name AS assigned_name FROM vehicles v LEFT JOIN users u ON u.id=v.assigned_user_id WHERE v.is_active=1 ORDER BY v.code")
      ]);
      const loadedUsers=(usersResult.values??[]) as unknown as AuthUser[];
      setTeamUsers(loadedUsers);
      setAuthUsers(loadedUsers);
      const owner=loadedUsers.find(user=>user.id==='local-owner');
      setAuthMode(owner?.pin_hash&&owner?.pin_salt?'login':'setup');
      setAuthUserId(owner?.id??loadedUsers.find(user=>user.is_active===1&&user.pin_hash&&user.pin_salt)?.id??'local-owner');
      await refreshDistributionOrders(db);
      await refreshCashSessions(db);
      setTeamVehicles((vehiclesResult.values??[]) as unknown as TeamVehicle[]);
      await refresh(repo);
      setCustomers(await new CustomerRepository(db).list());
      setOutstandingInvoices(await new PaymentRepository(db).listOutstanding());
      setSuppliers(await new SupplierRepository(db).list());
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
      setExpiryAlerts(await new StockRepository(db).getExpiryAlerts());
      setMovementHistory(await new StockRepository(db).getRecentMovements());
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
    }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'تعذر فتح قاعدة البيانات.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refresh,browserPreview]);

  async function scanProductBarcode(target:'product'|'sale'|'purchase'|'stock'|'order'='product',index=0){
    setError('');setNotice('');
    let listener:Awaited<ReturnType<typeof BarcodeScanner.addListener>>|null=null;
    try{
      const permission=await BarcodeScanner.checkPermissions();
      const granted=permission.camera==='granted'?permission:await BarcodeScanner.requestPermissions();
      if(granted.camera!=='granted')throw new Error('خاصك تسمح للتطبيق باستعمال الكاميرا باش يقرا الباركود.');
      document.body.classList.add('barcode-scanner-active');
      setBarcodeScanning(true);
      listener=await BarcodeScanner.addListener('barcodesScanned',async event=>{
        const value=event.barcodes[0]?.rawValue?.trim();
        await listener?.remove();listener=null;
        await BarcodeScanner.stopScan().catch(()=>undefined);
        document.body.classList.remove('barcode-scanner-active');setBarcodeScanning(false);
        if(value){
          if(target==='product'){setForm(current=>({...current,barcode:value}));setNotice('تقرا الباركود بنجاح: '+value);}
          else{
            const db=await openAppDatabase();const found=await db.query('SELECT product_id FROM barcodes WHERE barcode=? LIMIT 1',[value]);
            const productId=found.values?.[0]?.product_id;
            if(!productId){setError('هاد الباركود ما مربوط حتى بمنتج مسجل: '+value);return;}
            if(target==='sale')setSaleLines(rows=>rows.map((line,i)=>i===index?{...line,productId:String(productId)}:line));
            if(target==='purchase')setPurchaseLines(rows=>rows.map((line,i)=>i===index?{...line,productId:String(productId)}:line));
            if(target==='order')setOrderLines(rows=>rows.map((line,i)=>i===index?{...line,productId:String(productId)}:line));
            if(target==='stock')setStockProductId(String(productId));
            setNotice('تلقا المنتج المرتبط بالباركود '+value+' وتختار فالقائمة.');
          }
        }else setError('تقرا الرمز ولكن القيمة ديالو ما واضحةش؛ عاود المحاولة.');
      });
      await BarcodeScanner.startScan({formats:[BarcodeFormat.Ean13,BarcodeFormat.Ean8,BarcodeFormat.UpcA,BarcodeFormat.UpcE,BarcodeFormat.Code128,BarcodeFormat.Code39,BarcodeFormat.Itf]});
    }catch(reason){
      await listener?.remove().catch(()=>undefined);
      await BarcodeScanner.stopScan().catch(()=>undefined);
      document.body.classList.remove('barcode-scanner-active');setBarcodeScanning(false);
      setError(reason instanceof Error?reason.message:'تعذر تشغيل قارئ الباركود. تأكد من صلاحية الكاميرا.');
    }
  }
  async function stopBarcodeScan(){
    await BarcodeScanner.stopScan().catch(()=>undefined);
    document.body.classList.remove('barcode-scanner-active');setBarcodeScanning(false);
  }

  async function setupOwnerPin(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!isValidPin(setupPin)){setError('رمز PIN خاصو يكون من 4 حتى 8 أرقام.');return;}
    if(setupPin!==setupPinConfirm){setError('تأكيد رمز PIN ما مطابقش.');return;}
    setError('');setSaving(true);
    try{
      const db=await openAppDatabase(),credentials=await hashPin(setupPin);
      await db.run('UPDATE users SET pin_salt=?,pin_hash=?,updated_at=? WHERE id=?',[credentials.salt,credentials.hash,new Date().toISOString(),'local-owner']);
      const result=await db.query('SELECT id,display_name,phone,role,is_active,pin_salt,pin_hash FROM users WHERE id=?',['local-owner']);
      const owner=result.values?.[0] as unknown as AuthUser;
      if(!owner?.pin_hash)throw new Error('ما قدرناش نحفظو رمز الدخول.');
      setAuthUsers(current=>current.map(user=>user.id===owner.id?owner:user));
      setCurrentUser(owner);setSetupPin('');setSetupPinConfirm('');setAuthMode('login');
      setNotice('تسجل رمز الدخول ديال المالك بنجاح.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر إعداد رمز الدخول.');}
    finally{setSaving(false);}
  }

  async function loginUser(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const user=authUsers.find(item=>item.id===authUserId&&item.is_active===1);
    if(!user?.pin_hash||!user.pin_salt){setError('هاد المستخدم ما عندوش رمز دخول مضبوط.');return;}
    setError('');setSaving(true);
    try{
      if(!await verifyPin(authPin,user.pin_salt,user.pin_hash))throw new Error('رمز PIN غير صحيح.');
      setCurrentUser(user);setAuthPin('');setNotice('مرحبا '+user.display_name+'.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تسجيل الدخول.');}
    finally{setSaving(false);}
  }

  function logoutUser(){setCurrentUser(null);setAuthPin('');setNotice('');setError('');}

  function requirePermission(permission:AppPermission):boolean{
    if(!currentUser||!canPerform(currentUser.role,permission)){
      setError('ما عندكش الصلاحية للقيام بهاد العملية.');
      return false;
    }
    return true;
  }
  async function refreshDistributionOrders(db:Awaited<ReturnType<typeof openAppDatabase>>){
    const rows=await db.query(`SELECT o.id,o.order_number,c.name AS customer_name,o.created_by AS created_by_user_id,u.display_name AS created_by_name,o.assigned_vehicle_id,v.label AS vehicle_label,o.status,o.total_minor,o.created_at FROM sales_orders o JOIN customers c ON c.id=o.customer_id JOIN users u ON u.id=o.created_by LEFT JOIN vehicles v ON v.id=o.assigned_vehicle_id ORDER BY o.created_at DESC LIMIT 100`);
    const orders=(rows.values??[]) as unknown as DistributionOrderRow[];
    const lineEntries=await Promise.all(orders.map(async order=>{
      const result=await db.query(`SELECT sol.id,sol.product_id,sol.product_name_snapshot,sol.variant_id,sol.quantity,sol.unit_price_minor,
        MAX(0,sol.quantity-COALESCE((SELECT SUM(il.quantity) FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
          WHERE i.order_id=sol.order_id AND il.product_id=sol.product_id AND il.variant_id IS sol.variant_id AND i.status<>'voided'),0)) AS remaining_quantity
        FROM sales_order_lines sol WHERE sol.order_id=? ORDER BY sol.rowid`,[order.id]);
      return [order.id,(result.values??[]) as unknown as DistributionOrderLine[]] as const;
    }));
    setDistributionOrders(orders);
    setOrderDeliveryLines(Object.fromEntries(lineEntries));
    setDeliveryQuantities(current=>{
      const next={...current};
      for(const [orderId,lines] of lineEntries)for(const line of lines){const key=orderId+':'+line.id;next[key]=String(line.remaining_quantity);}
      return next;
    });
  }

  async function refreshCashSessions(db:Awaited<ReturnType<typeof openAppDatabase>>){
    const result=await db.query(`SELECT cs.id,cs.user_id,u.display_name AS user_name,v.label AS vehicle_label,cs.expected_cash_minor,
      COALESCE((SELECT SUM(ch.amount_minor) FROM cash_handovers ch WHERE ch.session_id=cs.id),0) AS handed_cash_minor,cs.counted_cash_minor,cs.discrepancy_reason,cs.status
      FROM cash_sessions cs JOIN users u ON u.id=cs.user_id LEFT JOIN vehicles v ON v.id=cs.vehicle_id
      ORDER BY cs.opened_at DESC LIMIT 100`);
    setCashSessions((result.values??[]) as unknown as CashSessionRow[]);
  }

  async function submitDistributionOrder(event:FormEvent<HTMLFormElement>){
    if(!requirePermission('create_orders'))return;
    event.preventDefault();
    if(!orderCustomerId||!currentUser?.id||orderLines.length===0||orderLines.some(line=>!line.productId||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0)){setError('اختار الزبون ومندوب الطلبات والمنتجات والكميات الصحيحة.');return;}
    if(new Set(orderLines.map(line=>line.productId)).size!==orderLines.length){setError('ما تعاودش نفس المنتج فسطور الطلب؛ جمع الكمية فسطر واحد.');return;}
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase(),now=new Date().toISOString(),id=crypto.randomUUID(),number='CMD-'+Date.now();
      const prepared=[] as Array<{productId:string;quantity:number;price:number;name:string;unit:string;total:number}>;
      let subtotal=0;
      for(const line of orderLines){
        const found=await db.query('SELECT id,name,base_unit,sale_price_minor FROM products WHERE id=? AND is_active=1',[line.productId]);
        const product=found.values?.[0];
        if(!product)throw new Error('كاين منتج غير صالح فالطلب.');
        const quantity=Number(line.quantity),price=Number(product.sale_price_minor),total=Math.round(quantity*price);
        if(!Number.isFinite(quantity)||quantity<=0||!Number.isSafeInteger(total))throw new Error('راجع كمية أو ثمن المنتج.');
        prepared.push({productId:String(product.id),quantity,price,name:String(product.name),unit:String(product.base_unit),total});subtotal+=total;
      }
      if(!Number.isSafeInteger(subtotal))throw new Error('مجموع الطلب كبير بزاف.');
      await db.beginTransaction();
      try{
        const customer=await db.query('SELECT id FROM customers WHERE id=? AND is_active=1',[orderCustomerId]);
        if(!customer.values?.length)throw new Error('الزبون غير موجود أو غير نشيط؛ حدّث اللائحة قبل تسجيل الطلب.');
        if(orderVehicleId){
          const vehicle=await db.query("SELECT id FROM vehicles WHERE id=? AND vehicle_type='delivery' AND is_active=1",[orderVehicleId]);
          if(!vehicle.values?.length)throw new Error('سيارة التوصيل المختارة غير صالحة أو غير نشيطة.');
        }
        await db.run('INSERT INTO sales_orders (id,order_number,customer_id,created_by,assigned_vehicle_id,status,subtotal_minor,offer_discount_minor,total_minor,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[id,number,orderCustomerId,currentUser.id,orderVehicleId||null,'submitted',subtotal,0,subtotal,now,now]);
        for(const line of prepared)await db.run('INSERT INTO sales_order_lines (id,order_id,product_id,quantity,unit_price_minor,line_total_minor,product_name_snapshot,unit_snapshot) VALUES (?,?,?,?,?,?,?,?)',[crypto.randomUUID(),id,line.productId,line.quantity,line.price,line.total,line.name,line.unit]);
        await db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[crypto.randomUUID(),currentUser.id,'order.submitted','sales_order',id,JSON.stringify({number,subtotal,lines:prepared.length}),now]);
      await db.commitTransaction();
      }catch(error){await db.rollbackTransaction().catch(()=>undefined);throw error;}
      await refreshDistributionOrders(db);setOrderLines([{productId:'',quantity:'1'}]);setNotice('تسجل الطلب '+number+' وتبعث للديبو للتحضير.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تسجيل الطلب.');}
    finally{setSaving(false);}
  }

  async function loadOrderToVehicle(order:DistributionOrderRow){
    if(!requirePermission('load_delivery_vehicle'))return;
    if(!canLoadDistributionOrder(order.status)){setError('ما يمكنش تحميل الطلب حتى يكمل الديبو التحضير ويحوّل حالتو إلى جاهز.');return;}
    if(!order.assigned_vehicle_id){setError('خاص تعيّن سيارة توصيل للطلب قبل التحميل.');return;}
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase(),now=new Date().toISOString();
      const lines=await db.query('SELECT product_id,variant_id,quantity,product_name_snapshot FROM sales_order_lines WHERE order_id=? ORDER BY rowid',[order.id]);
      if(!lines.values?.length)throw new Error('الطلب ما فيه حتى منتج.');
      await db.beginTransaction();
      try{
        const currentOrder=await db.query('SELECT status,assigned_vehicle_id FROM sales_orders WHERE id=?',[order.id]);
        const currentState=currentOrder.values?.[0];
        if(!currentState||String(currentState.status)!=='ready')throw new Error('حالة الطلب تبدلات؛ خاصو يبقى جاهز قبل التحميل. حدّث اللائحة وراجع الطلب.');
        if(String(currentState.assigned_vehicle_id??'')!==order.assigned_vehicle_id)throw new Error('السيارة المعيّنة تبدلات؛ حدّث اللائحة قبل التحميل.');
        const location=await db.query("SELECT sl.id,v.assigned_user_id,u.role,u.is_active FROM stock_locations sl JOIN vehicles v ON v.id=sl.vehicle_id LEFT JOIN users u ON u.id=v.assigned_user_id WHERE v.id=? AND v.vehicle_type='delivery' AND sl.location_type='vehicle' AND sl.is_active=1 AND v.is_active=1",[order.assigned_vehicle_id]);
        const destination=location.values?.[0]?.id;
        const driverId=location.values?.[0]?.assigned_user_id;
        if(!destination)throw new Error('مخزون سيارة التوصيل مازال ما تخلقش.');
        if(!driverId||location.values?.[0]?.role!=='delivery_driver'||Number(location.values?.[0]?.is_active)!==1)throw new Error('عيّن سائقاً نشيطاً لسيارة التوصيل قبل التحميل.');
        const already=await db.query("SELECT id FROM stock_movements WHERE reference_type='sales_order_load' AND reference_id=? LIMIT 1",[order.id]);
        if(already.values?.length)throw new Error('هاد الطلب سبق تحمّل للسيارة؛ ما يمكنش نعاودو التحميل.');
        for(const line of lines.values){
          let remaining=Number(line.quantity);
          const balances=await db.query("SELECT id,batch_id,quantity FROM stock_balances WHERE product_id=? AND variant_id IS ? AND location_id='loc-depot-main' AND quantity>0 ORDER BY updated_at,id",[line.product_id,line.variant_id??null]);
          const available=(balances.values??[]).reduce((sum,row)=>sum+Number(row.quantity),0);
          if(available+1e-9<remaining)throw new Error('المخزون غير كافٍ لتحميل: '+String(line.product_name_snapshot));
          for(const balance of balances.values??[]){
            if(remaining<=1e-9)break;
            const take=Math.min(remaining,Number(balance.quantity));
            await db.run('UPDATE stock_balances SET quantity=?,updated_at=? WHERE id=?',[Number(balance.quantity)-take,now,balance.id]);
            const destinationBalance=await db.query('SELECT id,quantity FROM stock_balances WHERE product_id=? AND variant_id IS ? AND location_id=? AND batch_id IS ? LIMIT 1',[line.product_id,line.variant_id??null,destination,balance.batch_id??null]);
            if(destinationBalance.values?.[0])await db.run('UPDATE stock_balances SET quantity=?,updated_at=? WHERE id=?',[Number(destinationBalance.values[0].quantity)+take,now,destinationBalance.values[0].id]);
            else await db.run("INSERT INTO stock_balances (id,product_id,variant_id,location_id,batch_id,quantity,updated_at) VALUES (?,?,?,?,?,?,?)",[crypto.randomUUID(),line.product_id,line.variant_id??null,destination,balance.batch_id??null,take,now]);
            await db.run("INSERT INTO stock_movements (id,product_id,variant_id,batch_id,from_location_id,to_location_id,quantity,movement_type,reference_type,reference_id,performed_by,responsible_user_id,occurred_at,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[crypto.randomUUID(),line.product_id,line.variant_id??null,balance.batch_id??null,'loc-depot-main',destination,take,'load_vehicle','sales_order_load',order.id,currentUser?.id??'local-owner',String(driverId),now,'تحميل طلب '+order.order_number+' للسيارة']);
            remaining-=take;
          }
          if(remaining>1e-9)throw new Error('تعذر إكمال تحميل: '+String(line.product_name_snapshot));
        }
        await db.run("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)",[crypto.randomUUID(),currentUser?.id??'local-owner','order.loaded_to_vehicle','sales_order',order.id,JSON.stringify({vehicleId:order.assigned_vehicle_id,driverId:String(driverId),lines:lines.values.length}),now]);
        await db.commitTransaction();
      }catch(error){await db.rollbackTransaction().catch(()=>undefined);throw error;}
      await refreshDistributionOrders(db);
      setNotice('تحمّل الطلب '+order.order_number+' فالسيارة بنجاح، والمخزون تنقل من الديبو للسيارة.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تحميل الطلب للسيارة.');}
    finally{setSaving(false);}
  }

  async function deliverOrder(order:DistributionOrderRow){
    if(!requirePermission('deliver_assigned_orders'))return;
    if(!order.assigned_vehicle_id){setError('الطلب ما عندوش سيارة توصيل.');return;}
    const orderLinesForDelivery=orderDeliveryLines[order.id]??[];
    const selected=orderLinesForDelivery.map(line=>({line,quantity:Number(deliveryQuantities[order.id+':'+line.id]??line.remaining_quantity)})).filter(item=>item.quantity>0);
    if(!selected.length){setError('دخل كمية مسلّمة واحدة على الأقل.');return;}
    if(selected.some(item=>!Number.isFinite(item.quantity)||item.quantity<=0||item.quantity>item.line.remaining_quantity+1e-9)){
      setError('راجع الكميات؛ ما يمكنش تسلم أكثر من الكمية المتبقية فالطلب.');return;
    }
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase();
      const collectedMinor=madToMinorUnits(Number(deliveryCollectedAmounts[order.id]??'0'));
      if(!Number.isSafeInteger(collectedMinor)||collectedMinor<0)throw new Error('راجع المبلغ النقدي المستخلص.');
      if(collectedMinor>0&&!requirePermission('collect_delivery_cash'))throw new Error('ما عندكش صلاحية تسجيل تحصيل نقدي عند التوصيل.');
      await db.beginTransaction();
      try{
        const currentOrder=await db.query('SELECT status,assigned_vehicle_id,customer_id FROM sales_orders WHERE id=?',[order.id]);
        const orderState=currentOrder.values?.[0];
        if(!orderState||!['ready','partially_delivered'].includes(String(orderState.status)))throw new Error('حالة الطلب تبدلات؛ حدّث اللائحة قبل التسليم.');
        if(String(orderState.assigned_vehicle_id??'')!==order.assigned_vehicle_id)throw new Error('السيارة المعيّنة للطلب تبدلات؛ راجع الطلب من جديد.');
        const location=await db.query("SELECT sl.id,v.assigned_user_id,u.role,u.is_active FROM stock_locations sl JOIN vehicles v ON v.id=sl.vehicle_id LEFT JOIN users u ON u.id=v.assigned_user_id WHERE v.id=? AND v.vehicle_type='delivery' AND sl.location_type='vehicle' AND sl.is_active=1 AND v.is_active=1",[order.assigned_vehicle_id]);
        const locationId=location.values?.[0]?.id;
        const driverId=location.values?.[0]?.assigned_user_id;
        if(!locationId)throw new Error('مخزون سيارة التوصيل غير موجود.');
        if(!driverId||location.values?.[0]?.role!=='delivery_driver'||Number(location.values?.[0]?.is_active)!==1)throw new Error('عيّن سائقاً نشيطاً لسيارة التوصيل قبل إصدار فاتورة التسليم.');
        if(currentUser?.role!=='owner'&&driverId!==currentUser?.id)throw new Error('يمكن للسائق تسليم الطلبات المعيّنة ليه فقط.');
        const customerId=orderState.customer_id;
        if(!customerId)throw new Error('الزبون المرتبط بالطلب غير موجود.');
        const loaded=await db.query("SELECT id FROM stock_movements WHERE reference_type='sales_order_load' AND reference_id=? AND to_location_id=? LIMIT 1",[order.id,locationId]);
        if(!loaded.values?.length)throw new Error('خاصك تحمّل الطلب لهاد السيارة قبل تأكيد التسليم.');
        const currentLines=await db.query(`SELECT sol.id,MAX(0,sol.quantity-COALESCE((SELECT SUM(il.quantity) FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
          WHERE i.order_id=sol.order_id AND il.product_id=sol.product_id AND il.variant_id IS sol.variant_id AND i.status<>'voided'),0)) AS remaining_quantity
          FROM sales_order_lines sol WHERE sol.order_id=?`,[order.id]);
        const currentRemaining=new Map((currentLines.values??[]).map(line=>[String(line.id),Number(line.remaining_quantity)]));
        if(selected.some(item=>!currentRemaining.has(item.line.id)||item.quantity>Number(currentRemaining.get(item.line.id)??0)+1e-9))throw new Error('الكمية المتبقية تبدلات؛ حدّث الطلب وراجع الكميات قبل التسليم.');
        const result=await new SalesRepository(db).create({
          id:crypto.randomUUID(),invoiceNumber:'T-'+Date.now(),customerId:String(customerId),
          sellerUserId:String(driverId),locationId:String(locationId),vehicleId:order.assigned_vehicle_id,orderId:order.id,
          lines:selected.map(item=>({productId:item.line.product_id,variantId:item.line.variant_id,quantity:item.quantity,unitPriceMinor:item.line.unit_price_minor})),
          collectedMinor,paymentMethod:'cash',note:'تحصيل عند تسليم طلب '+order.order_number
        },'external');
        const now=new Date().toISOString();
        const remaining=await db.query(`SELECT COUNT(*) AS pending FROM sales_order_lines sol
          WHERE sol.order_id=? AND sol.quantity>COALESCE((SELECT SUM(il.quantity) FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
            WHERE i.order_id=sol.order_id AND il.product_id=sol.product_id AND il.variant_id IS sol.variant_id AND i.status<>'voided'),0)+0.000000001`,[order.id]);
        const nextStatus=Number(remaining.values?.[0]?.pending??0)===0?'delivered':'partially_delivered';
        if(collectedMinor>0){
          const activeSession=await db.query("SELECT id FROM cash_sessions WHERE user_id=? AND vehicle_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1",[String(driverId),order.assigned_vehicle_id]);
          if(activeSession.values?.[0])await db.run('UPDATE cash_sessions SET expected_cash_minor=expected_cash_minor+? WHERE id=?',[collectedMinor,activeSession.values[0].id]);
          else await db.run("INSERT INTO cash_sessions (id,user_id,vehicle_id,opened_at,opening_cash_minor,expected_cash_minor,status) VALUES (?,?,?,?,0,?,'open')",[crypto.randomUUID(),String(driverId),order.assigned_vehicle_id,now,collectedMinor]);
        }
        await db.run("UPDATE sales_orders SET status=?,updated_at=? WHERE id=? AND status IN ('ready','partially_delivered')",[nextStatus,now,order.id]);
        await db.run("INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)",[crypto.randomUUID(),String(driverId),nextStatus==='delivered'?'order.delivered':'order.partially_delivered','sales_order',order.id,JSON.stringify({invoiceId:result.invoiceId,invoiceNumber:result.invoiceNumber,lines:selected.map(item=>({lineId:item.line.id,quantity:item.quantity})),pendingLines:Number(remaining.values?.[0]?.pending??0)}),now]);
        await db.commitTransaction();
        setNotice((nextStatus==='delivered'?'تسلم الطلب كامل. ':'تسجل تسليم جزئي وباقي السلع باقية فالطلب. ')+'الفاتورة '+result.invoiceNumber+'؛ المحصل '+formatMad(result.collectedMinor)+' والباقي على الزبون '+formatMad(result.dueMinor)+'.');
      }catch(error){await db.rollbackTransaction().catch(()=>undefined);throw error;}
      await refreshDistributionOrders(db);
      await refreshCashSessions(db);
      await refresh(repository??new ProductRepository(db));
      setOutstandingInvoices(await new PaymentRepository(db).listOutstanding());
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
      setMovementHistory(await new StockRepository(db).getRecentMovements());
      setDeliveryCollectedAmounts(current=>{const next={...current};delete next[order.id];return next;});
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تأكيد تسليم الطلب.');}
    finally{setSaving(false);}
  }

  async function submitCashHandover(event:FormEvent<HTMLFormElement>){
    if(!requirePermission('handover_own_cash'))return;
    event.preventDefault();
    const session=cashSessions.find(item=>item.id===handoverSessionId);
    const receiver=teamUsers.find(item=>item.id===handoverReceiverId&&item.is_active===1);
    const amount=madToMinorUnits(Number(handoverAmount));
    if(!session||session.status!=='open'){setError('اختار جلسة نقدية مفتوحة.');return;}
    if(currentUser?.role!=='owner'&&session.user_id!==currentUser?.id){setError('يمكنك تسليم النقدية ديال عهدتك فقط.');return;}
    if(!receiver||!['owner','depot_manager'].includes(receiver.role)){setError('المستلم خاصو يكون المالك أو مسؤول الديبو.');return;}
    const outstanding=Number(session.expected_cash_minor)-Number(session.handed_cash_minor);
    if(!Number.isSafeInteger(amount)||amount<=0||amount>outstanding){setError('مبلغ التسليم خاصو يكون أكبر من صفر وما يفوتش المبلغ اللي باقي فالعهدة.');return;}
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase(),now=new Date().toISOString(),receipt='REC-'+Date.now();
      await db.beginTransaction();
      try{
        const latestSession=await db.query("SELECT expected_cash_minor,status FROM cash_sessions WHERE id=?",[session.id]);
        const live=latestSession.values?.[0];
        if(!live||String(live.status)!=='open')throw new Error('العهدة تسلمات أو تسدات من قبل؛ حدّث اللائحة.');
        const handedRows=await db.query('SELECT COALESCE(SUM(amount_minor),0) AS total FROM cash_handovers WHERE session_id=?',[session.id]);
        const totalAlreadyHanded=Number(handedRows.values?.[0]?.total??0);
        const liveExpected=Number(live.expected_cash_minor);
        const liveOutstanding=liveExpected-totalAlreadyHanded;
        if(!Number.isSafeInteger(liveExpected)||!Number.isSafeInteger(totalAlreadyHanded)||liveOutstanding<0||amount>liveOutstanding)throw new Error('تبدل رصيد العهدة؛ المبلغ اللي بقى أقل من المبلغ اللي بغيتي تسلم. حدّث اللائحة.');
        await db.run('INSERT INTO cash_handovers (id,session_id,from_user_id,to_user_id,amount_minor,receipt_number,received_at,note) VALUES (?,?,?,?,?,?,?,?)',[crypto.randomUUID(),session.id,session.user_id,receiver.id,amount,receipt,now,'تسليم نقدية من '+session.user_name]);
        await db.run("INSERT INTO payments (id,invoice_id,customer_id,amount_minor,method,payment_kind,received_by,received_at,note) VALUES (?,NULL,NULL,?,'cash','cash_handover',?,?,?)",[crypto.randomUUID(),amount,receiver.id,now,'وصل تسليم '+receipt]);
        const totalHanded=totalAlreadyHanded+amount;
        if(totalHanded>=liveExpected)await db.run("UPDATE cash_sessions SET status='submitted',closed_at=? WHERE id=? AND status='open'",[now,session.id]);
        await db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[crypto.randomUUID(),currentUser.id,'cash.handed_over','cash_session',session.id,JSON.stringify({receipt,from:session.user_id,to:receiver.id,amountMinor:amount,totalHanded}),now]);
        await db.commitTransaction();
      }catch(error){await db.rollbackTransaction().catch(()=>undefined);throw error;}
      await refreshCashSessions(db);setHandoverAmount('');setNotice('تسجل وصل تسليم النقدية '+receipt+' بقيمة '+formatMad(amount)+'.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تسجيل تسليم النقدية.');}
    finally{setSaving(false);}
  }

  async function reconcileCashSession(session:CashSessionRow){
    if(!requirePermission('reconcile_cash'))return;
    if(session.status!=='submitted'){setError('خاص جلسة النقدية تكون تسلمات قبل المطابقة.');return;}
    const counted=madToMinorUnits(Number(cashCountedAmounts[session.id]??''));
    const reason=(cashDiscrepancyReasons[session.id]??'').trim();
    let reconciledDifference=0;
    if(!Number.isSafeInteger(counted)||counted<0){setError('دخل المبلغ اللي تعدّ فعلياً فالديبو.');return;}
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase(),now=new Date().toISOString();
      await db.beginTransaction();
      try{
        const latestSession=await db.query("SELECT expected_cash_minor,status FROM cash_sessions WHERE id=?",[session.id]);
        const live=latestSession.values?.[0];
        if(!live||String(live.status)!=='submitted')throw new Error('حالة العهدة تبدلات؛ ما بقاتش كتسنى المطابقة.');
        const liveExpected=Number(live.expected_cash_minor);
        const liveDifference=counted-liveExpected;
        if(!Number.isSafeInteger(liveExpected)||liveExpected<0)throw new Error('المبلغ المتوقع فالعهدة غير صالح وخصو مراجعة.');
        if(liveDifference!==0&&!reason)throw new Error('كتب سبب الفرق بين المبلغ المتوقع الحالي والمبلغ المعدود.');
        reconciledDifference=liveDifference;
        await db.run("UPDATE cash_sessions SET counted_cash_minor=?,discrepancy_reason=?,status='reconciled' WHERE id=? AND status='submitted'",[counted,reason||null,session.id]);
        await db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[crypto.randomUUID(),currentUser?.id??'local-owner','cash.reconciled','cash_session',session.id,JSON.stringify({expectedMinor:liveExpected,countedMinor:counted,differenceMinor:liveDifference,reason}),now]);
        await db.commitTransaction();
      }catch(error){await db.rollbackTransaction().catch(()=>undefined);throw error;}
      await refreshCashSessions(db);setNotice(reconciledDifference===0?'تطابقت جلسة النقدية بنجاح.':'تسجلات المطابقة مع فرق '+formatSignedMad(reconciledDifference)+' وسبب الفرق.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر إتمام مطابقة النقدية.');}
    finally{setSaving(false);}
  }

  async function changeOrderStatus(order:DistributionOrderRow,next:DistributionOrderRow['status']){
    if(!requirePermission('prepare_orders'))return;
    if(!canTransitionDistributionOrder(order.status,next)){setError('هاد الانتقال ما مسموحش من الحالة الحالية. خاص الطلب يدوز من مراحل التحضير بالترتيب.');return;}
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase(),now=new Date().toISOString();
      await db.beginTransaction();
      try{
        const latest=await db.query('SELECT status FROM sales_orders WHERE id=?',[order.id]);
        if(!latest.values?.[0]||String(latest.values[0].status)!==order.status)throw new Error('حالة الطلب تبدلات من طرف مستخدم آخر؛ حدّث اللائحة قبل المحاولة.');
        await db.run('UPDATE sales_orders SET status=?,updated_at=? WHERE id=? AND status=?',[next,now,order.id,order.status]);
        await db.run('INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',[crypto.randomUUID(),currentUser?.id??'local-owner','order.status_changed','sales_order',order.id,JSON.stringify({from:order.status,to:next}),now]);
        await db.commitTransaction();
      }catch(error){await db.rollbackTransaction().catch(()=>undefined);throw error;}
      await refreshDistributionOrders(db);setNotice('تحدّثت حالة الطلب '+order.order_number+'.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تحديث حالة الطلب.');}
    finally{setSaving(false);}
  }

  async function submitTeamMember(event:FormEvent<HTMLFormElement>){
    if(!requirePermission('manage_team'))return;
    event.preventDefault();
    const cleanName=teamName.trim();
    if(!cleanName){setError('اسم المستخدم مطلوب.');return;}
    if(!isValidPin(teamPin)){setError('رمز PIN ديال المستخدم خاصو يكون من 4 حتى 8 أرقام.');return;}
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase(),now=new Date().toISOString(),id=crypto.randomUUID(),credentials=await hashPin(teamPin);
      await db.run('INSERT INTO users (id,display_name,phone,role,is_active,created_at,updated_at,pin_salt,pin_hash) VALUES (?,?,?,?,1,?,?,?,?)',[id,cleanName,teamPhone.trim()||null,teamRole,now,now,credentials.salt,credentials.hash]);
      const result=await db.query('SELECT id,display_name,phone,role,is_active,pin_salt,pin_hash FROM users ORDER BY display_name');
      const updatedUsers=(result.values??[]) as unknown as AuthUser[];
      setTeamUsers(updatedUsers);setAuthUsers(updatedUsers);
      setTeamName('');setTeamPhone('');setTeamPin('');
      setNotice('تسجل عضو الفريق ورمز الدخول ديالو بنجاح.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تسجيل عضو الفريق.');}
    finally{setSaving(false);}
  }

  async function saveVehicleAssignment(vehicle:TeamVehicle){
    if(!requirePermission('manage_vehicles'))return;
    const userId=assignment[vehicle.id]??vehicle.assigned_user_id??'';
    if(userId){
      const user=teamUsers.find(item=>item.id===userId);
      const expectedRole=vehicle.vehicle_type==='van_sales'?'van_sales':'delivery_driver';
      if(!user||user.role!==expectedRole){setError(vehicle.vehicle_type==='van_sales'?'السيارة ديال البيع خاصها تتربط بمندوب بيع بالسيارة.':'سيارة التوصيل خاصها تتربط بسائق.');return;}
    }
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase();
      await db.run('UPDATE vehicles SET assigned_user_id=?,updated_at=? WHERE id=?',[userId||null,new Date().toISOString(),vehicle.id]);
      const result=await db.query('SELECT v.id,v.code,v.label,v.vehicle_type,v.assigned_user_id,u.display_name AS assigned_name FROM vehicles v LEFT JOIN users u ON u.id=v.assigned_user_id WHERE v.is_active=1 ORDER BY v.code');
      setTeamVehicles((result.values??[]) as unknown as TeamVehicle[]);
      setNotice('تحدّث تعيين السيارة بنجاح.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تحديث تعيين السيارة.');}
    finally{setSaving(false);}
  }

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return products.filter(p => !term || [p.name, p.category, p.subcategory, p.barcode].some(v => v?.toLocaleLowerCase().includes(term)));
  }, [products, search]);

  async function submitStock(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('adjust_depot_stock'))return;
    event.preventDefault();
    if (!repository || !stockProductId) return;
    setError(''); setNotice(''); setSaving(true);
    try {
      const quantity = Number(stockQuantity);
      const db = await openAppDatabase();
      await new StockRepository(db).record({
        id: crypto.randomUUID(), productId: stockProductId,
        fromLocationId: stockDirection === 'out' ? 'loc-depot-main' : null,
        toLocationId: stockDirection === 'in' ? 'loc-depot-main' : null,
        quantity, movementType: stockDirection === 'in' ? 'purchase_receipt' : stockOutType,
        note: stockDirection === 'in' ? 'إدخال للمستودع' : 'إخراج من المستودع',
      });
      await refresh(repository); setExpiryAlerts(await new StockRepository(db).getExpiryAlerts()); setMovementHistory(await new StockRepository(db).getRecentMovements()); setStockQuantity('1'); setNotice('تسجلات حركة المخزون بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الحركة.'); }
    finally { setSaving(false); }
  }

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('manage_customers'))return;
    event.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      const repo=new CustomerRepository(db);
      const input={id:editingCustomerId??crypto.randomUUID(),name:customerName,phone:customerPhone,city:customerCity};
      if(editingCustomerId)await repo.update(input);else await repo.create(input);
      setCustomers(await repo.list());
      setCustomerName('');setCustomerPhone('');setCustomerCity('');setEditingCustomerId(null);
      setNotice(editingCustomerId?'تحدّث ملف الزبون.':'تسجل الزبون بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر حفظ الزبون.'); }
    finally { setSaving(false); }
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('manage_expenses'))return;
    event.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      await new ExpenseRepository(db).create({
        id: crypto.randomUUID(), expenseNumber: 'EXP-' + Date.now(),
        category: expenseCategory, amountMinor: madToMinorUnits(Number(expenseAmount)),
        paymentMethod: 'cash', paidBy: currentUser?.id??'local-owner', note: expenseNote,
      });
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
      setExpenseAmount(''); setExpenseNote('');
      setNotice('تسجل المصروف وتحدث صافي الربح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل المصروف.'); }
    finally { setSaving(false); }
  }

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('manage_purchases'))return;
    event.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      const repo=new SupplierRepository(db),input={id:editingSupplierId??crypto.randomUUID(),name:supplierName,phone:supplierPhone};
      if(editingSupplierId)await repo.update(input);else await repo.create(input);
      setSuppliers(await repo.list());
      setSupplierName('');setSupplierPhone('');setEditingSupplierId(null);
      setNotice(editingSupplierId?'تحدّث ملف المورد.':'تسجل المورد بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر حفظ المورد.'); }
    finally { setSaving(false); }
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('manage_purchases'))return;
    event.preventDefault();
    if (!purchaseSupplierId || purchaseLines.length===0 || purchaseLines.some(line=>!line.productId||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0||!Number.isFinite(Number(line.unitCost))||Number(line.unitCost)<0)) { setError('اختار المورد والمنتجات وتأكد من الكميات والتكاليف.'); return; }
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      const result = await new PurchaseRepository(db).create({
        id: crypto.randomUUID(), receiptNumber: 'ACH-' + Date.now(),
        supplierId: purchaseSupplierId, receivedBy: currentUser?.id??'local-owner', locationId: 'loc-depot-main',
        lines: purchaseLines.map(line=>({
          productId:line.productId,quantity:Number(line.quantity),unitCostMinor:madToMinorUnits(Number(line.unitCost)),
          batchCode:line.batchCode||null,expiryDate:line.expiryDate||null,
        })),
      });
      const repo = repository ?? new ProductRepository(db);
      await refresh(repo);
      setSuppliers(await new SupplierRepository(db).list());
      setExpiryAlerts(await new StockRepository(db).getExpiryAlerts());
      setMovementHistory(await new StockRepository(db).getRecentMovements());
      setPurchaseLines([{productId:'',quantity:'1',unitCost:'',batchCode:'',expiryDate:''}]);
      setNotice('تسجل وصل الشراء ' + result.receiptNumber + ' بمجموع ' + formatMad(result.totalMinor));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل التوريد.'); }
    finally { setSaving(false); }
  }

  async function submitCollection(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('collect_customer_debt'))return;
    event.preventDefault();
    if (!collectionInvoiceId) { setError('اختار الفاتورة أولاً.'); return; }
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      const result = await new PaymentRepository(db).collect({
        id: crypto.randomUUID(), invoiceId: collectionInvoiceId,
        amountMinor: madToMinorUnits(Number(collectionAmount)),
        method: 'cash', receivedBy: currentUser?.id??'local-owner',
      });
      setCustomers(await new CustomerRepository(db).list());
      setOutstandingInvoices(await new PaymentRepository(db).listOutstanding());
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
      setCollectionAmount('');
      setNotice('تسجل التسديد. الدين المتبقي فالفاتورة: ' + formatMad(result.dueMinor));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل التسديد.'); }
    finally { setSaving(false); }
  }


  async function submitVehicleSale(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('create_vehicle_sales'))return;
    event.preventDefault();
    if(!saleCustomerId||saleLines.length===0||saleLines.some(line=>!line.productId||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0)){setError('اختار الزبون والمنتجات والكميات الصحيحة.');return;}
    const collectedMinor=madToMinorUnits(Number(saleCollected||0));
    if(!Number.isSafeInteger(collectedMinor)||collectedMinor<0){setError('راجع المبلغ اللي تجمع دابا.');return;}
    if(collectedMinor>0&&!requirePermission('collect_vehicle_sales_cash'))return;
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase();
      const assigned=await db.query("SELECT v.id,v.assigned_user_id,sl.id AS location_id FROM vehicles v JOIN stock_locations sl ON sl.vehicle_id=v.id AND sl.location_type='vehicle' AND sl.is_active=1 WHERE v.vehicle_type='van_sales' AND v.is_active=1 AND v.assigned_user_id=?",[currentUser?.id]);
      if((assigned.values??[]).length!==1)throw new Error('خاص تكون عندك سيارة بيع نشيطة واحدة معيّنة ليك ومخزونها مفعّل.');
      const vehicle=assigned.values?.[0];
      if(!vehicle?.location_id)throw new Error('مخزون سيارة البيع غير موجود.');
      await db.beginTransaction();
      try{
        const liveVehicle=await db.query("SELECT v.id FROM vehicles v JOIN stock_locations sl ON sl.vehicle_id=v.id AND sl.location_type='vehicle' AND sl.is_active=1 WHERE v.id=? AND v.vehicle_type='van_sales' AND v.is_active=1 AND v.assigned_user_id=?",[String(vehicle.id),currentUser!.id]);
        if(!liveVehicle.values?.length)throw new Error('تعيين سيارة البيع تبدل؛ حدّث بيانات السيارة قبل تسجيل الفاتورة.');
        const result=await new SalesRepository(db).create({
          id:crypto.randomUUID(),invoiceNumber:'TV-'+Date.now(),customerId:saleCustomerId,
          sellerUserId:currentUser!.id,locationId:String(vehicle.location_id),vehicleId:String(vehicle.id),
          lines:saleLines.map(line=>({productId:line.productId,quantity:Number(line.quantity)})),
          collectedMinor,paymentMethod:'cash',note:'بيع مباشر من سيارة البيع',
        },'external');
        const now=new Date().toISOString();
        if(collectedMinor>0){
          const active=await db.query("SELECT id FROM cash_sessions WHERE user_id=? AND vehicle_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1",[currentUser!.id,String(vehicle.id)]);
          if(active.values?.[0])await db.run('UPDATE cash_sessions SET expected_cash_minor=expected_cash_minor+? WHERE id=?',[collectedMinor,active.values[0].id]);
          else await db.run("INSERT INTO cash_sessions (id,user_id,vehicle_id,opened_at,opening_cash_minor,expected_cash_minor,status) VALUES (?,?,?,?,0,?,'open')",[crypto.randomUUID(),currentUser!.id,String(vehicle.id),now,collectedMinor]);
        }
        await db.commitTransaction();
        setNotice('تسجلات فاتورة السيارة '+result.invoiceNumber+'. المحصل '+formatMad(result.collectedMinor)+' والباقي '+formatMad(result.dueMinor)+'.');
      }catch(error){await db.rollbackTransaction().catch(()=>undefined);throw error;}
      await refresh(repository??new ProductRepository(db));
      setCustomers(await new CustomerRepository(db).list());
      setOutstandingInvoices(await new PaymentRepository(db).listOutstanding());
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
      await refreshCashSessions(db);
      await refreshDistributionOrders(db);
      setSaleLines([{productId:'',quantity:'1'}]);setSaleCollected('');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تسجيل بيع السيارة.');}
    finally{setSaving(false);}
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('create_depot_sales'))return;
    event.preventDefault();
    if (!saleCustomerId || saleLines.length===0 || saleLines.some(line=>!line.productId||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0)) { setError('اختار الزبون والمنتجات وتأكد من الكميات.'); return; }
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      const discountMinor = madToMinorUnits(Number(saleDiscount || 0));
      const collectedMinor = madToMinorUnits(Number(saleCollected || 0));
      const result = await new SalesRepository(db).create({
        id: crypto.randomUUID(), invoiceNumber: 'T-' + Date.now(),
        customerId: saleCustomerId, sellerUserId: currentUser?.id??'local-owner', locationId: 'loc-depot-main',
        lines: saleLines.map(line=>({productId:line.productId,quantity:Number(line.quantity)})),
        discountMinor, collectedMinor, paymentMethod: 'cash',
      });
      const repo = repository ?? new ProductRepository(db);
      await refresh(repo);
      setCustomers(await new CustomerRepository(db).list());
      setOutstandingInvoices(await new PaymentRepository(db).listOutstanding());
      setSuppliers(await new SupplierRepository(db).list());
      setExpiryAlerts(await new StockRepository(db).getExpiryAlerts());
      setMovementHistory(await new StockRepository(db).getRecentMovements());
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
      setSaleLines([{productId:'',quantity:'1'}]); setSaleDiscount('0'); setSaleCollected('');
      const customer = customers.find(item=>item.id===saleCustomerId);
      setLastInvoice({
        number:result.invoiceNumber,date:new Date().toLocaleString('fr-MA'),
        customer:customer?.name??'زبون',phone:customer?.phone??null,city:customer?.city??null,
        seller:currentUser?.display_name??'المالك',
        lines:saleLines.map(line=>{const product=products.find(item=>item.id===line.productId);const quantity=Number(line.quantity);const unitPrice=Number(product?.sale_price_minor??0);return {name:product?.name??'منتج',quantity,unitPrice,total:Math.round(quantity*unitPrice)};}),
        subtotal:result.subtotalMinor,discount:result.discountMinor,total:result.totalMinor,collected:result.collectedMinor,due:result.dueMinor,
      });
      setNotice('تسجلات الفاتورة ' + result.invoiceNumber + ' بنجاح. المتبقي على الزبون: ' + formatMad(result.dueMinor));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الفاتورة.'); }
    finally { setSaving(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    if(!requirePermission('manage_products'))return;
    event.preventDefault();
    if (!repository) return;
    setError(''); setNotice(''); setSaving(true);
    try {
      const input={id:editingProductId??crypto.randomUUID(),name:form.name,category:form.category,subcategory:form.subcategory,
        baseUnit:form.unit,piecesPerCarton:form.unit==='carton'?Number(form.pieces):null,
        purchaseCostMinor:madToMinorUnits(Number(form.cost)),salePriceMinor:madToMinorUnits(Number(form.price)),
        lowStockThreshold:Number(form.threshold),barcode:form.barcode,imageLocalUri:form.imageLocalUri};
      if(editingProductId)await repository.update(input);else await repository.create(input);
      await refresh(repository);setForm(emptyForm);setEditingProductId(null);setNotice(editingProductId?'تحدّث المنتج بلا ما تبدل تاريخ الفواتير أو المخزون.':'تسجل المنتج بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر حفظ المنتج.'); }
    finally { setSaving(false); }
  }

  if(browserPreview)return <BrowserPreview />;

  return (
    <main className="app-shell" dir={language==='ar'?'rtl':'ltr'}>
      <header className="topbar"><div><span className="brand-mark">ت</span><div><p className="eyebrow">{tr('company')}</p><h1>{tr('appName')}</h1></div></div><div className="topbar-actions"><label className="language-picker">{tr('language')}<select aria-label={tr('language')} value={language} onChange={e=>setLanguage(e.target.value as AppLanguage)}><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></select></label>{currentUser&&<><span className="mode-tag">{currentUser.display_name} · {tr(currentUser.role)}</span><button type="button" className="secondary-button" onClick={logoutUser}>{tr('logout')}</button></>}<span className="mode-tag">نسخة تطوير</span></div></header>
      <section className="page-heading"><div><p className="eyebrow">تدبير شركة التوزيع</p><h2>{currentUser?.role==='owner'?tr(activeSection):'مساحة العمل'}</h2><p>{currentUser?.role==='owner'?'كل عمليات الشركة ومؤشراتها في مكان واحد':'مرحبا بك في مساحة العمل الخاصة بدورك'}</p></div><div className="total-card"><strong>{products.length}</strong><span>منتج مسجل</span></div></section>
      {loading && <div className="message">كنوجد قاعدة البيانات...</div>}
      {!loading && error && <div className="message error" role="alert">{error}<small>المعاينة فالمتصفح ما كتخزنش البيانات؛ افتح تطبيق Android المبني باش تجرب SQLite.</small></div>}
      {notice && <div className="message success" role="status">{notice}</div>}
      {barcodeScanning&&<div className="barcode-scanner-overlay"><div className="barcode-scanner-frame"><span>وجه الكاميرا نحو باركود المنتج</span><span className="barcode-scanner-corners"/><button type="button" className="secondary-button" onClick={stopBarcodeScan}>إلغاء المسح</button></div></div>}
      {lastInvoice&&<section className="panel last-invoice-actions"><div><strong>آخر فاتورة: {lastInvoice.number}</strong><p className="hint">الفاتورة محفوظة فقاعدة البيانات، وتقدر تطبعها أو تحفظها PDF.</p></div><button type="button" className="primary-button" onClick={()=>window.print()}>طباعة الفاتورة / PDF</button></section>}
      {lastInvoice&&<section id="invoice-print-root" aria-label="فاتورة البيع">
        <header className="invoice-print-header"><div><h1>تطبيقي</h1><p>فاتورة بيع</p></div><div><strong>رقم الفاتورة</strong><span>{lastInvoice.number}</span><strong>التاريخ</strong><span>{lastInvoice.date}</span></div></header>
        <div className="invoice-print-customer"><strong>الزبون:</strong> {lastInvoice.customer}{lastInvoice.phone&&<> · {lastInvoice.phone}</>}{lastInvoice.city&&<> · {lastInvoice.city}</>}<br/><strong>البائع:</strong> {lastInvoice.seller}</div>
        <table className="invoice-print-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>ثمن الوحدة</th><th>المجموع</th></tr></thead><tbody>{lastInvoice.lines.map((line,index)=><tr key={index}><td>{line.name}</td><td>{line.quantity}</td><td>{formatMad(line.unitPrice)}</td><td>{formatMad(line.total)}</td></tr>)}</tbody></table>
        <div className="invoice-print-totals"><p>المجموع قبل التخفيض: <strong>{formatMad(lastInvoice.subtotal)}</strong></p><p>التخفيض: <strong>{formatMad(lastInvoice.discount)}</strong></p><p>الصافي: <strong>{formatMad(lastInvoice.total)}</strong></p><p>المؤدى: <strong>{formatMad(lastInvoice.collected)}</strong></p><p>الباقي: <strong>{formatMad(lastInvoice.due)}</strong></p></div>
        <p className="invoice-print-footer">شكراً على ثقتكم</p>
      </section>}

      {!loading&&!currentUser&&authMode==='setup'&&<section className="panel auth-panel"><div className="panel-heading"><div><h3>إعداد دخول المالك</h3><p>أول مرة خاصك تختار رمز PIN خاص بالمالك. غادي يتخزن كـ hash مملح، ماشي كنص واضح.</p></div></div><form onSubmit={setupOwnerPin}><label>رمز PIN (4 إلى 8 أرقام)<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} required value={setupPin} onChange={e=>setSetupPin(e.target.value)} /></label><label>تأكيد رمز PIN<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} required value={setupPinConfirm} onChange={e=>setSetupPinConfirm(e.target.value)} /></label><button className="primary-button" disabled={saving}>{saving?'كيتم الإعداد...':'حفظ رمز المالك والدخول'}</button></form></section>}
      {!loading&&!currentUser&&authMode==='login'&&<section className="panel auth-panel"><div className="panel-heading"><div><h3>تسجيل الدخول</h3><p>اختار المستخدم ودخل رمز PIN ديالو.</p></div></div><form onSubmit={loginUser}><label>المستخدم<select required value={authUserId} onChange={e=>setAuthUserId(e.target.value)}>{authUsers.filter(user=>user.is_active===1&&user.pin_hash&&user.pin_salt).map(user=><option key={user.id} value={user.id}>{user.display_name} · {tr(roleLabels[user.role])}</option>)}</select></label><label>رمز PIN<input type="password" inputMode="numeric" autoComplete="current-password" maxLength={8} required value={authPin} onChange={e=>setAuthPin(e.target.value)} /></label><button className="primary-button" disabled={saving}>{saving?'كيتم التحقق...':'دخول'}</button></form></section>}
      {currentUser?.role==='order_rep'&&repository&&<div className="content-grid">
        <section id="role-orders" data-section="management" className="panel team-panel">
          <div className="panel-heading"><div><h3>تسجيل طلب محل</h3><p>سجل الكميات المطلوبة من المحل وأرسلها للديبو للتحضير</p></div><span className="step-mark">طلب جديد</span></div>
          <form onSubmit={submitDistributionOrder}>
            <label>المحل / الزبون<select required value={orderCustomerId} onChange={e=>setOrderCustomerId(e.target.value)}><option value="">اختار المحل</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
            <label>سيارة التوصيل (اختياري)<select value={orderVehicleId} onChange={e=>setOrderVehicleId(e.target.value)}><option value="">تتحدد لاحقاً من الديبو</option>{teamVehicles.filter(vehicle=>vehicle.vehicle_type==='delivery').map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></label>
            {orderLines.map((line,index)=><div className="sale-line" key={index}><ProductCardPicker products={products} value={line.productId} onChange={value=>setOrderLines(current=>current.map((item,i)=>i===index?{...item,productId:value}:item))}/><button type="button" className="secondary-button" onClick={()=>scanProductBarcode('order',index)}>مسح باركود المنتج</button><label>الكمية المطلوبة<input required type="number" min="0.01" step="0.01" value={line.quantity} onChange={e=>setOrderLines(current=>current.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))}/></label><button type="button" className="remove-line" disabled={orderLines.length===1} onClick={()=>setOrderLines(current=>current.filter((_,i)=>i!==index))}>حذف السطر</button></div>)}
            <button type="button" className="secondary-button" onClick={()=>setOrderLines(current=>[...current,{productId:'',quantity:'1'}])}>+ إضافة منتج</button>
            <button className="primary-button" disabled={saving||customers.length===0||products.length===0}>إرسال الطلب للديبو</button>
          </form>
          <div className="section-divider"></div><h4>طلباتي</h4>
          {distributionOrders.filter(order=>order.created_by_user_id===currentUser.id).length===0?<p className="hint">مازال ما سجلتي حتى طلب.</p>:distributionOrders.filter(order=>order.created_by_user_id===currentUser.id).map(order=><article className="team-row" key={order.id}><div><strong>{order.order_number} · {order.customer_name}</strong><span>{order.vehicle_label||'السيارة لم تحدد بعد'} · {formatMad(order.total_minor)}</span><span>الحالة: {({draft:'مسودة',submitted:'مرسل للديبو',accepted:'مقبول',preparing:'قيد التحضير',ready:'جاهز',partially_delivered:'تسليم جزئي',delivered:'تم التسليم',cancelled:'ملغى'} as Record<string,string>)[order.status]}</span></div></article>)}
        </section>
      </div>}
      {currentUser?.role==='depot_manager'&&repository&&<div className="content-grid">
        <section id="role-depot-orders" className="panel team-panel">
          <div className="panel-heading"><div><h3>تحضير طلبات المحلات</h3><p>قبول الطلبات، التحضير، وتأكيد الجاهزية ثم تحميل سيارة التوصيل</p></div><span className="step-mark">الديبو</span></div>
          {distributionOrders.filter(order=>!['delivered','cancelled'].includes(order.status)).length===0?<p className="hint">ما كايناش طلبات مفتوحة حالياً.</p>:distributionOrders.filter(order=>!['delivered','cancelled'].includes(order.status)).map(order=><article className="team-row" key={order.id}><div><strong>{order.order_number} · {order.customer_name}</strong><span>طلب من: {order.created_by_name} · {order.vehicle_label||'بلا سيارة محددة'}</span><span>الحالة: {({draft:'مسودة',submitted:'مرسل للديبو',accepted:'مقبول',preparing:'قيد التحضير',ready:'جاهز',partially_delivered:'تسليم جزئي',delivered:'تم التسليم',cancelled:'ملغى'} as Record<string,string>)[order.status]}</span></div><div className="order-actions">{order.status==='submitted'&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>changeOrderStatus(order,'accepted')}>قبول الطلب</button>}{order.status==='accepted'&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>changeOrderStatus(order,'preparing')}>بدء التحضير</button>}{order.status==='preparing'&&<button type="button" className="primary-button" disabled={saving} onClick={()=>changeOrderStatus(order,'ready')}>تأكيد الجاهزية</button>}{order.status==='ready'&&<button type="button" className="secondary-button" disabled={saving||!order.assigned_vehicle_id} onClick={()=>loadOrderToVehicle(order)}>تحميل سيارة التوصيل</button>}</div></article>)}
          <p className="hint">التسليم النهائي وإصدار فاتورة الكميات المسلمة من اختصاص السائق المعيّن، ولا يمكن للديبو تأكيده بدلاً عنه.</p>
        </section>

        <section id="role-depot-cash" className="panel team-panel"><div className="panel-heading"><div><h3>استلام ومطابقة النقدية</h3><p>راجع الجلسات اللي تسلمات للديبو وسجل المبلغ المعدود فعلياً</p></div></div>
          {cashSessions.filter(session=>session.status==='submitted').length===0?<p className="hint">ما كايناش عهد نقدية كتسنى المطابقة.</p>:cashSessions.filter(session=>session.status==='submitted').map(session=><article className="team-row" key={session.id}><div><strong>{session.user_name} · {session.vehicle_label||'بدون سيارة'}</strong><span>المفروض: {formatMad(session.expected_cash_minor)} · تسلم: {formatMad(session.handed_cash_minor)}</span><label>المبلغ المعدود (DH)<input type="number" min="0" step="0.01" value={cashCountedAmounts[session.id]??''} onChange={e=>setCashCountedAmounts(current=>({...current,[session.id]:e.target.value}))}/></label><label>سبب الفرق إذا وجد<input value={cashDiscrepancyReasons[session.id]??''} onChange={e=>setCashDiscrepancyReasons(current=>({...current,[session.id]:e.target.value}))}/></label><button type="button" className="secondary-button" disabled={saving} onClick={()=>reconcileCashSession(session)}>تأكيد المطابقة</button></div></article>)}
        </section>

        <section id="role-depot-sales" className="panel sales-panel"><div className="panel-heading"><div><h3>بيع من المستودع</h3><p>بيع مباشر من مخزون الديبو مع أداء جزئي أو آجل</p></div></div>
          <form onSubmit={submitSale}>
            <label>الزبون<select required value={saleCustomerId} onChange={e=>setSaleCustomerId(e.target.value)}><option value="">اختار الزبون</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
            {saleLines.map((line,index)=><div className="sale-line" key={index}><ProductCardPicker products={products} value={line.productId} onChange={value=>setSaleLines(current=>current.map((item,i)=>i===index?{...item,productId:value}:item))}/><button type="button" className="secondary-button" onClick={()=>scanProductBarcode('sale',index)}>مسح باركود المنتج</button><label>الكمية<input type="number" min="0.01" step="0.01" required value={line.quantity} onChange={e=>setSaleLines(current=>current.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))}/></label><button type="button" className="remove-line" disabled={saleLines.length===1} onClick={()=>setSaleLines(current=>current.filter((_,i)=>i!==index))}>حذف السطر</button></div>)}
            <button type="button" className="secondary-button" onClick={()=>setSaleLines(current=>[...current,{productId:'',quantity:'1'}])}>+ إضافة منتج</button>
            <label>التخفيض (DH)<input type="number" min="0" step="0.01" value={saleDiscount} onChange={e=>setSaleDiscount(e.target.value)}/></label>
            <label>المبلغ المؤدى دابا (DH)<input type="number" min="0" step="0.01" value={saleCollected} onChange={e=>setSaleCollected(e.target.value)}/></label>
            <button className="primary-button" disabled={saving||customers.length===0||products.length===0}>تأكيد البيع من المستودع</button>
          </form>
        </section>
        <section id="role-depot-debts" data-section="sales" className="panel collection-panel"><div className="panel-heading"><div><h3>تحصيل ديون الزبناء</h3><p>تسجيل أداء لاحق على فاتورة سابقة</p></div></div>
          <form onSubmit={submitCollection}>
            <label>الفاتورة المستحقة<select required value={collectionInvoiceId} onChange={e=>setCollectionInvoiceId(e.target.value)}><option value="">اختار الفاتورة</option>{outstandingInvoices.map(invoice=><option key={invoice.invoiceId} value={invoice.invoiceId}>{invoice.invoiceNumber} · {invoice.customerName} · باقي {formatMad(invoice.dueMinor)}</option>)}</select></label>
            <label>المبلغ المستخلص (DH)<input type="number" min="0.01" step="0.01" required value={collectionAmount} onChange={e=>setCollectionAmount(e.target.value)}/></label>
            <button className="primary-button" disabled={saving||outstandingInvoices.length===0}>تأكيد تحصيل الدين</button>
          </form>
        </section>
        <section id="role-depot-stock" data-section="inventory" className="panel stock-panel"><div className="panel-heading"><div><h3>المخزون والتنبيهات</h3><p>مراقبة المنتجات والكميات المنخفضة</p></div></div>
          {products.length===0?<p className="hint">مازال ما تسجلوش المنتجات.</p>:products.map(product=><article className="alert-row" key={product.id}><div><strong>{product.name}</strong><span>حد التنبيه: {product.low_stock_threshold}</span></div><strong>{product.total_stock} متوفر</strong></article>)}
        </section>
      </div>}

      {currentUser?.role==='van_sales'&&repository&&<div className="content-grid">
        <section id="role-van-sales" className="panel sales-panel"><div className="panel-heading"><div><h3>بيع مباشر من السيارة</h3><p>الفاتورة كتخصم من مخزون السيارة المعيّنة ليك فقط</p></div><span className="step-mark">بيع السيارة</span></div>
          <form onSubmit={submitVehicleSale}>
            <label>الزبون<select required value={saleCustomerId} onChange={e=>setSaleCustomerId(e.target.value)}><option value="">اختار الزبون</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
            {saleLines.map((line,index)=><div className="sale-line" key={index}><ProductCardPicker products={products} value={line.productId} onChange={value=>setSaleLines(current=>current.map((item,i)=>i===index?{...item,productId:value}:item))}/><button type="button" className="secondary-button" onClick={()=>scanProductBarcode('sale',index)}>مسح باركود المنتج</button><label>الكمية<input type="number" min="0.01" step="0.01" required value={line.quantity} onChange={e=>setSaleLines(current=>current.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))}/></label><button type="button" className="remove-line" disabled={saleLines.length===1} onClick={()=>setSaleLines(current=>current.filter((_,i)=>i!==index))}>حذف السطر</button></div>)}
            <button type="button" className="secondary-button" onClick={()=>setSaleLines(current=>[...current,{productId:'',quantity:'1'}])}>+ إضافة منتج</button>
            <label>المبلغ النقدي المحصل دابا (DH)<input type="number" min="0" step="0.01" value={saleCollected} onChange={e=>setSaleCollected(e.target.value)} placeholder="0 إذا البيع بالدين"/></label>
            <button className="primary-button" disabled={saving||customers.length===0||products.length===0}>تأكيد البيع وخصم مخزون السيارة</button>
          </form>
          <p className="hint">الثمن كيتاخد مباشرة من سعر المنتج المسجل؛ ما كاينش حقل لتغييره. المبالغ المحصلة كتدخل لعهدة السيارة.</p>
        </section>
        <section id="role-van-cash" className="panel team-panel"><div className="panel-heading"><div><h3>عهدة النقدية ديالي</h3><p>المبالغ النقدية المسجلة من مبيعات السيارة</p></div></div>
          {cashSessions.filter(session=>session.user_id===currentUser.id).length===0?<p className="hint">مازال ما تسجلات حتى عملية نقدية.</p>:cashSessions.filter(session=>session.user_id===currentUser.id).map(session=><article className="team-row" key={session.id}><div><strong>{session.vehicle_label||'سيارة البيع'}</strong><span>المتوقع: {formatMad(session.expected_cash_minor)} · المسلم: {formatMad(session.handed_cash_minor)} · الباقي: {formatMad(session.expected_cash_minor-session.handed_cash_minor)}</span><span>الحالة: {session.status==='open'?'مفتوحة':session.status==='submitted'?'تسلمات للديبو':'تمت المطابقة'}</span></div></article>)}
          <div className="section-divider"></div><h4>تسليم النقدية للديبو</h4>
          <form onSubmit={submitCashHandover}>
            <label>جلسة التحصيل<select required value={handoverSessionId} onChange={e=>setHandoverSessionId(e.target.value)}><option value="">اختار عهدتك المفتوحة</option>{cashSessions.filter(session=>session.status==='open'&&session.user_id===currentUser.id).map(session=><option key={session.id} value={session.id}>{session.vehicle_label||'السيارة'} · باقي {formatMad(session.expected_cash_minor-session.handed_cash_minor)}</option>)}</select></label>
            <label>المستلم فالديبو<select required value={handoverReceiverId} onChange={e=>setHandoverReceiverId(e.target.value)}><option value="">اختار المستلم</option>{teamUsers.filter(user=>user.is_active===1&&(user.role==='owner'||user.role==='depot_manager')).map(user=><option key={user.id} value={user.id}>{user.display_name} · {tr(roleLabels[user.role])}</option>)}</select></label>
            <label>المبلغ المسلم (DH)<input required type="number" min="0.01" step="0.01" value={handoverAmount} onChange={e=>setHandoverAmount(e.target.value)}/></label>
            <button className="primary-button" disabled={saving||cashSessions.every(session=>session.status!=='open'||session.user_id!==currentUser.id)}>تأكيد التسليم وإصدار الوصل</button>
          </form>
        </section>
      </div>}
      {currentUser?.role==='delivery_driver'&&repository&&<div className="content-grid">
        <section id="role-driver-delivery" className="panel team-panel">
          <div className="panel-heading"><div><h3>طلبات التوصيل ديالي</h3><p>راجع الطلبات المحملة لسيارتك وسجل الكميات اللي سلمتي فعلاً</p></div><span className="step-mark">التوصيل</span></div>
          {distributionOrders.filter(order=>teamVehicles.some(vehicle=>vehicle.id===order.assigned_vehicle_id&&vehicle.assigned_user_id===currentUser.id&&vehicle.vehicle_type==='delivery')&&['ready','partially_delivered'].includes(order.status)).length===0?<p className="hint">ما عندك حتى طلب جاهز للتسليم حالياً.</p>:distributionOrders.filter(order=>teamVehicles.some(vehicle=>vehicle.id===order.assigned_vehicle_id&&vehicle.assigned_user_id===currentUser.id&&vehicle.vehicle_type==='delivery')&&['ready','partially_delivered'].includes(order.status)).map(order=><article className="team-row" key={order.id}><div><strong>{order.order_number} · {order.customer_name}</strong><span>{order.vehicle_label||'سيارتي'} · {order.status==='ready'?'جاهز للتسليم':'تسليم جزئي'}</span><div className="order-delivery-lines">{(orderDeliveryLines[order.id]??[]).filter(line=>line.remaining_quantity>0).map(line=><label key={line.id}>{line.product_name_snapshot} · باقي {line.remaining_quantity}<input type="number" min="0" max={line.remaining_quantity} step="0.01" value={deliveryQuantities[order.id+':'+line.id]??String(line.remaining_quantity)} onChange={e=>setDeliveryQuantities(current=>({...current,[order.id+':'+line.id]:e.target.value}))}/></label>)}</div><label>النقد اللي جمعتي (DH)<input type="number" min="0" step="0.01" value={deliveryCollectedAmounts[order.id]??'0'} onChange={e=>setDeliveryCollectedAmounts(current=>({...current,[order.id]:e.target.value}))} /></label><button type="button" className="primary-button" disabled={saving} onClick={()=>deliverOrder(order)}>تأكيد التسليم وإصدار الفاتورة</button></div></article>)}
        </section>
        <section id="role-driver-cash" className="panel team-panel"><div className="panel-heading"><div><h3>تسليم النقدية للديبو</h3><p>سلم المبلغ اللي جمعتي وخذ وصل التسليم</p></div></div>
          <form onSubmit={submitCashHandover}>
            <label>جلسة التحصيل<select required value={handoverSessionId} onChange={e=>setHandoverSessionId(e.target.value)}><option value="">اختار عهدتك المفتوحة</option>{cashSessions.filter(session=>session.status==='open'&&session.user_id===currentUser.id).map(session=><option key={session.id} value={session.id}>{session.vehicle_label||'السيارة'} · باقي {formatMad(session.expected_cash_minor-session.handed_cash_minor)}</option>)}</select></label>
            <label>المستلم فالديبو<select required value={handoverReceiverId} onChange={e=>setHandoverReceiverId(e.target.value)}><option value="">اختار المستلم</option>{teamUsers.filter(user=>user.is_active===1&&(user.role==='owner'||user.role==='depot_manager')).map(user=><option key={user.id} value={user.id}>{user.display_name} · {tr(roleLabels[user.role])}</option>)}</select></label>
            <label>المبلغ المسلم (DH)<input required type="number" min="0.01" step="0.01" value={handoverAmount} onChange={e=>setHandoverAmount(e.target.value)}/></label>
            <button className="primary-button" disabled={saving||cashSessions.every(session=>session.status!=='open'||session.user_id!==currentUser.id)}>تأكيد التسليم وإصدار الوصل</button>
          </form>
        </section>
      </div>}
      {currentUser&&repository&&workspaceNavigation.length>0&&<nav className="main-section-nav role-section-nav" aria-label={tr('workspaceNavigation')}>
        {workspaceNavigation.map(item=><button type="button" key={item.id} aria-label={item.label} onClick={()=>document.getElementById(item.id)?.scrollIntoView({behavior:'smooth',block:'start'})}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span className="nav-label">{item.label}</span></button>)}
      </nav>}
      {currentUser?.role==='owner'&&repository&&<nav className="main-section-nav" aria-label="الأقسام الرئيسية">{([{id:'home',label:tr('home'),icon:'⌂'},{id:'sales',label:tr('sales'),icon:'▣'},{id:'inventory',label:tr('inventory'),icon:'▤'},{id:'distribution',label:tr('distribution'),icon:'⇢'},{id:'purchases',label:tr('purchases'),icon:'⇩'},{id:'relations',label:tr('relations'),icon:'♧'},{id:'management',label:tr('management'),icon:'⚙'},{id:'settings',label:tr('settings'),icon:'☷'}] as const).map(item=><button type="button" key={item.id} className={activeSection===item.id?'active':''} aria-label={item.label} aria-current={activeSection===item.id?'page':undefined} onClick={()=>setActiveSection(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span className="nav-label">{item.label}</span></button>)}</nav>}
      {currentUser?.role==='owner'&&repository && <div className="content-grid section-view" data-active-section={activeSection}>
        <section data-section="home" className="dashboard-overview">
          <div className="dashboard-welcome"><div><p className="eyebrow">نظرة عامة</p><h3>مرحبا {currentUser.display_name}</h3><p>ها ملخص النشاط ديال الشركة، وتقدر تمشي مباشرة لأي عملية.</p></div><span className="dashboard-date">{new Date().toLocaleDateString('ar-MA',{weekday:'long',day:'numeric',month:'long'})}</span></div>
          <div className="dashboard-metrics">
            <article><span>المبيعات الصافية</span><strong>{formatMad(financialSummary?.salesMinor??0)}</strong><small>منذ بداية الاستخدام</small></article>
            <article><span>صافي الربح التقديري</span><strong>{formatSignedMad(financialSummary?.netProfitMinor??0)}</strong><small>بعد مصاريف التشغيل</small></article>
            <article><span>الديون المستحقة</span><strong>{formatMad(financialSummary?.outstandingMinor??0)}</strong><small>{outstandingInvoices.length} فاتورة فيها باقي</small></article>
            <article><span>المنتجات المسجلة</span><strong>{products.length}</strong><small>{products.filter(product=>product.low_stock_threshold>0&&product.total_stock<=product.low_stock_threshold).length} منتجات تحت حد التنبيه</small></article>
          </div>
          <div className="dashboard-shortcuts"><div className="panel-heading"><div><h3>اختصارات سريعة</h3><p>وصل مباشرة للخدمة اللي محتاج</p></div></div><div className="shortcut-grid">
            <button type="button" onClick={()=>setActiveSection('sales')}><b>＋</b><span>بيع جديد</span></button>
            <button type="button" onClick={()=>setActiveSection('inventory')}><b>▦</b><span>إدارة المخزون</span></button>
            <button type="button" onClick={()=>setActiveSection('purchases')}><b>⇩</b><span>تسجيل توريد</span></button>
            <button type="button" onClick={()=>setActiveSection('relations')}><b>♙</b><span>الزبناء والديون</span></button>
            <button type="button" onClick={()=>setActiveSection('management')}><b>▤</b><span>التقارير والإدارة</span></button>
          </div></div>
          <div className="dashboard-bottom"><article><strong>الطلبات المفتوحة</strong><b>{distributionOrders.filter(order=>!['delivered','cancelled'].includes(order.status)).length}</b><span>طلبات تحتاج متابعة</span></article><article><strong>تنبيهات الصلاحية</strong><b>{expiryAlerts.length}</b><span>دفعات مسجلة بتاريخ صلاحية</span></article><article><strong>فواتير مؤكدة</strong><b>{financialSummary?.invoiceCount??0}</b><span>إجمالي الفواتير</span></article></div>
        </section>
        <section data-section="sales" className="panel team-panel">
          <div className="panel-heading"><div><h3>طلبات المحلات</h3><p>مندوب الطلبات يسجل طلب الزبون، والديبو يتابع التحضير والتجهيز</p></div><span className="step-mark">01</span></div>
          <form onSubmit={submitDistributionOrder}>
            <label>المحل / الزبون<select required value={orderCustomerId} onChange={e=>setOrderCustomerId(e.target.value)}><option value="">اختار المحل</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
            <div className="two-cols"><label>مندوب الطلبات<input value={currentUser?.display_name??''} disabled /></label>
            <label>سيارة التوصيل (اختياري)<select value={orderVehicleId} onChange={e=>setOrderVehicleId(e.target.value)}><option value="">تتحدد لاحقاً</option>{teamVehicles.filter(vehicle=>vehicle.vehicle_type==='delivery').map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.label} · {vehicle.assigned_name||'بدون سائق'}</option>)}</select></label></div>
            {orderLines.map((line,index)=><div className="sale-line" key={index}><ProductCardPicker products={products} value={line.productId} onChange={value=>setOrderLines(current=>current.map((item,i)=>i===index?{...item,productId:value}:item))}/><button type="button" className="secondary-button" onClick={()=>scanProductBarcode('sale',index)}>مسح باركود المنتج</button><label>الكمية المطلوبة<input required type="number" min="0.01" step="0.01" value={line.quantity} onChange={e=>setOrderLines(current=>current.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))}/></label><button type="button" className="remove-line" disabled={orderLines.length===1} onClick={()=>setOrderLines(current=>current.filter((_,i)=>i!==index))}>حذف السطر</button></div>)}
            <button type="button" className="secondary-button" onClick={()=>setOrderLines(current=>[...current,{productId:'',quantity:'1'}])}>+ إضافة منتج للطلب</button>
            <button className="primary-button" disabled={saving||customers.length===0||products.length===0||teamUsers.every(user=>user.role!=='order_rep')}>إرسال الطلب للديبو</button>
          </form>
          <div className="section-divider"></div><h4>متابعة الطلبات</h4>
          {distributionOrders.length===0?<p className="hint">مازال ما تسجل حتى طلب.</p>:distributionOrders.map(order=><article className="team-row" key={order.id}><div><strong>{order.order_number} · {order.customer_name}</strong><span>{order.created_by_name} · {order.vehicle_label||'بلا سيارة محددة'} · {formatMad(order.total_minor)}</span><span>الحالة: {({draft:'مسودة',submitted:'مرسل للديبو',accepted:'مقبول',preparing:'قيد التحضير',ready:'جاهز للتحميل',partially_delivered:'تسليم جزئي',delivered:'تم التسليم',cancelled:'ملغى'} as Record<string,string>)[order.status]}</span></div><div className="order-actions">{order.status==='submitted'&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>changeOrderStatus(order,'accepted')}>قبول الطلب</button>}{order.status==='accepted'&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>changeOrderStatus(order,'preparing')}>بدء التحضير</button>}{order.status==='preparing'&&<button type="button" className="primary-button" disabled={saving} onClick={()=>changeOrderStatus(order,'ready')}>تأكيد الجاهزية</button>}{(order.status==='ready'||order.status==='partially_delivered')&&<><div className="order-delivery-lines">{(orderDeliveryLines[order.id]??[]).filter(line=>line.remaining_quantity>0).map(line=><label key={line.id}>{line.product_name_snapshot} · باقي {line.remaining_quantity}<input type="number" min="0" max={line.remaining_quantity} step="0.01" value={deliveryQuantities[order.id+':'+line.id]??String(line.remaining_quantity)} onChange={e=>setDeliveryQuantities(current=>({...current,[order.id+':'+line.id]:e.target.value}))}/></label>)}</div><label>المبلغ النقدي المستخلص (DH)<input type="number" min="0" step="0.01" value={deliveryCollectedAmounts[order.id]??'0'} onChange={e=>setDeliveryCollectedAmounts(current=>({...current,[order.id]:e.target.value}))} /></label>{order.status==='ready'&&<button type="button" className="secondary-button" disabled={saving||!order.assigned_vehicle_id} onClick={()=>loadOrderToVehicle(order)}>تحميل السيارة</button>}<button type="button" className="primary-button" disabled={saving} onClick={()=>deliverOrder(order)}>تأكيد الكميات المسلّمة وإصدار الفاتورة</button></>}</div></article>)}
          <p className="hint">كل تسليم كينشئ فاتورة بالكميات اللي تسلمات فعلاً، وكيخصمها من مخزون السيارة. الكميات اللي ما تسلماتش كتبقى فالطلب ويمكن تكملها فزيارة أخرى.</p>
        </section>
        <section data-section="management" className="panel team-panel">
          <div className="panel-heading"><div><h3>الفريق وتعيين السيارات</h3><p>تسجيل أعضاء الفريق وربط سيارات البيع والتوصيل بالمسؤول عنها</p></div><span className="step-mark">الفريق</span></div>
          <form onSubmit={submitTeamMember}>
            <label>اسم المستخدم<input required value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="اسم المندوب أو السائق" /></label>
            <div className="two-cols"><label>الهاتف<input value={teamPhone} onChange={e=>setTeamPhone(e.target.value)} placeholder="اختياري" /></label>
              <label>الدور<select value={teamRole} onChange={e=>setTeamRole(e.target.value as TeamUser["role"])}>
                <option value="depot_manager">مسؤول الديبو</option><option value="order_rep">مندوب الطلبات</option><option value="van_sales">مندوب البيع بالسيارة</option><option value="delivery_driver">السائق</option>
              </select></label></div>
            <label>رمز PIN للمستخدم (4 إلى 8 أرقام)<input type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} required value={teamPin} onChange={e=>setTeamPin(e.target.value)} /></label>
            <button className="secondary-button" disabled={saving}>{saving?"كيتم الحفظ...":"إضافة عضو للفريق"}</button>
          </form>
          <div className="team-list"><h4>الأعضاء المسجلون</h4>
            {teamUsers.map(user=><article className="team-row" key={user.id}><div><strong>{user.display_name}</strong><span>{tr(roleLabels[user.role])} · {user.phone||"بدون هاتف"}</span></div><span className={user.is_active?"team-active":"team-inactive"}>{user.is_active?"نشط":"موقوف"}</span></article>)}
          </div>
          <div className="section-divider"></div>
          <div className="team-list"><h4>السيارات والمسؤولون عنها</h4>
            {teamVehicles.length===0?<p className="hint">مازال ما تسجلات حتى سيارة. زيد السيارة من قسم المخزون والتحويلات.</p>:teamVehicles.map(vehicle=>{
              const eligible=teamUsers.filter(user=>user.is_active===1&&user.role===(vehicle.vehicle_type==="van_sales"?"van_sales":"delivery_driver"));
              return <article className="vehicle-assignment" key={vehicle.id}>
                <div><strong>{vehicle.label}</strong><span>{vehicle.code} · {vehicle.vehicle_type==="van_sales"?"سيارة بيع":"سيارة توصيل"}</span></div>
                <label>المسؤول<select value={assignment[vehicle.id]??vehicle.assigned_user_id??""} onChange={e=>setAssignment(current=>({...current,[vehicle.id]:e.target.value}))}>
                  <option value="">بدون مسؤول</option>{eligible.map(user=><option key={user.id} value={user.id}>{user.display_name}</option>)}
                </select></label>
                <button type="button" className="secondary-button" disabled={saving} onClick={()=>saveVehicleAssignment(vehicle)}>حفظ التعيين</button>
              </article>;
            })}
          </div>
          <p className="hint">تسجيل الدخول محمي برمز PIN، والصلاحيات كتتحدد حسب الدور. قبل الاستعمال التجاري، خاص تجربة كل دور والعمليات ديالو على هاتف حقيقي.</p>
        </section>
        <section id="inventory-section" data-section="inventory" className="panel form-panel"><div className="panel-heading"><div><h3>إضافة منتج</h3><p>المبالغ بالدرهم المغربي</p></div><span className="step-mark">01</span></div>
          <form onSubmit={submit}>
            <label>اسم المنتج<input required value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="مثال: ماء معدني 1.5L" /></label>
            <div className="two-cols"><label>الصنف<select value={form.category} onChange={e => setForm({...form,category:e.target.value})}><option>مواد غذائية</option><option>مشروبات</option><option>مواد التنظيف</option><option>العناية والتجميل</option><option>مواد منزلية</option><option>متنوعات</option></select></label><label>الصنف الفرعي<input value={form.subcategory} onChange={e => setForm({...form,subcategory:e.target.value})} placeholder="اختياري" /></label></div>
            <div className="two-cols"><label>وحدة البيع<select value={form.unit} onChange={e => setForm({...form,unit:e.target.value as 'piece'|'carton'})}><option value="piece">قطعة</option><option value="carton">كرتونة</option></select></label>{form.unit === 'carton' && <label>القطع في الكرتونة<input type="number" min="1" step="1" required value={form.pieces} onChange={e => setForm({...form,pieces:e.target.value})} /></label>}</div>
            <div className="two-cols"><label>ثمن الشراء (DH)<input type="number" min="0" step="0.01" required value={form.cost} onChange={e => setForm({...form,cost:e.target.value})} placeholder="0.00" /></label><label>ثمن البيع (DH)<input type="number" min="0" step="0.01" required value={form.price} onChange={e => setForm({...form,price:e.target.value})} placeholder="0.00" /></label></div>
            <div className="two-cols"><label>حد التنبيه للمخزون<input type="number" min="0" step="0.01" value={form.threshold} onChange={e => setForm({...form,threshold:e.target.value})} /></label><label>الباركود<input value={form.barcode} onChange={e => setForm({...form,barcode:e.target.value})} placeholder="اختياري" /></label></div><label className="product-photo-picker">صورة المنتج (الكاميرا أو المعرض)<input type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){setError('اختار ملف صورة صالح.');return;}if(file.size>3*1024*1024){setError('الصورة كبيرة؛ اختار صورة أقل من 3 ميغابايت.');return;}const reader=new FileReader();reader.onload=()=>setForm(current=>({...current,imageLocalUri:String(reader.result??'')}));reader.onerror=()=>setError('تعذر قراءة الصورة.');reader.readAsDataURL(file);}} /></label>{form.imageLocalUri&&<div className="product-photo-preview"><img src={form.imageLocalUri} alt="معاينة صورة المنتج"/><button type="button" className="secondary-button" onClick={()=>setForm(current=>({...current,imageLocalUri:''}))}>حذف الصورة</button></div>}<button type="button" className="secondary-button barcode-scan-trigger" disabled={saving||barcodeScanning} onClick={()=>scanProductBarcode('product')}>مسح الباركود بالكاميرا</button>
            <button className="primary-button" disabled={saving}>{saving ? 'كيتم الحفظ...' : editingProductId?'حفظ التعديلات':'حفظ المنتج'}</button>
            {editingProductId&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>{setEditingProductId(null);setForm(emptyForm);}}>إلغاء التعديل</button>}
          </form>
        </section>
        <section data-section="inventory" className="panel list-panel"><div className="panel-heading"><div><h3>لائحة المنتجات</h3><p>المخزون الحالي مجموع المستودع والسيارات</p></div><span className="step-mark">02</span></div>
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="قلب بالاسم أو الصنف أو الباركود..." />
          {visibleProducts.length === 0 ? <div className="empty-state"><span>📦</span><strong>ما كاين حتى منتج دابا</strong><p>بدا بإضافة أول منتج من الاستمارة.</p></div> : <div className="product-catalog-grid">{visibleProducts.map(product => <article className="product-catalog-card" key={product.id}><div className="product-catalog-image">{product.image_local_uri?<img src={product.image_local_uri} alt={product.name} loading="lazy"/>:<span aria-label="لا توجد صورة">📦</span>}</div><div className="product-catalog-info"><strong>{product.name}</strong><span>{product.category||'بدون صنف'} · {formatMad(product.sale_price_minor)}</span><small>المخزون: {product.total_stock} {product.barcode?` · ${product.barcode}`:''}</small><button type="button" className="secondary-button" onClick={()=>{if(!requirePermission('manage_products'))return;setEditingProductId(product.id);setForm({name:product.name,category:product.category??'مواد غذائية',subcategory:product.subcategory??'',unit:product.base_unit==='carton'?'carton':'piece',pieces:String(product.pieces_per_carton??12),cost:(product.purchase_cost_minor/100).toFixed(2),price:(product.sale_price_minor/100).toFixed(2),threshold:String(product.low_stock_threshold),barcode:product.barcode??'',imageLocalUri:product.image_local_uri??''});setActiveSection('inventory');}}>تعديل</button></div></article>)}</div>}
        </section>
        <StockAndReturnsPanel />
        <DataBackupPanel />
        <section data-section="inventory" className="panel stock-panel"><div className="panel-heading"><div><h3>حركة المخزون</h3><p>إدخال أو إخراج الكمية من المستودع الرئيسي</p></div><span className="step-mark">03</span></div>
          <form onSubmit={submitStock}>
            <label>المنتج<select required value={stockProductId} onChange={e => setStockProductId(e.target.value)}><option value="">اختار المنتج</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" className="secondary-button" onClick={()=>scanProductBarcode('stock')}>مسح باركود المنتج</button>
            <div className="two-cols"><label>نوع الحركة<select value={stockDirection} onChange={e => setStockDirection(e.target.value as 'in'|'out')}><option value="in">إدخال للمستودع</option><option value="out">إخراج من المستودع</option></select></label><label>الكمية<input type="number" min="0.01" step="0.01" required value={stockQuantity} onChange={e => setStockQuantity(e.target.value)} /></label></div>
            {stockDirection === 'out' && <label>سبب الإخراج<select value={stockOutType} onChange={e => setStockOutType(e.target.value as 'delivery'|'damage'|'supplier_return')}><option value="delivery">تسليم / توزيع</option><option value="damage">تالف</option><option value="supplier_return">إرجاع للمورد</option></select></label>}
            <button className="primary-button" disabled={saving || products.length === 0}>{saving ? 'كيتم التسجيل...' : 'تسجيل حركة المخزون'}</button>
          </form>
          <p className="hint">أي إخراج بكمية أكبر من المخزون المتوفر غادي يترفض. كل حركة كتتسجل مع تحديث الرصيد داخل نفس المعاملة.</p>
        </section>
        <section id="relations-section" data-section="relations" className="panel customer-panel"><div className="panel-heading"><div><h3>الزبناء والديون</h3><p>الدين محسوب مباشرة من الفواتير المؤكدة</p></div><span className="step-mark">04</span></div>
          <form onSubmit={submitCustomer}>
            <label>اسم الزبون<input required value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="اسم المحل أو الزبون" /></label>
            <div className="two-cols"><label>الهاتف<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="اختياري" /></label><label>المدينة<input value={customerCity} onChange={e => setCustomerCity(e.target.value)} placeholder="مثلاً برشيد" /></label></div>
            <button className="primary-button" disabled={saving}>{saving?'كيتم الحفظ...':editingCustomerId?'حفظ تعديل الزبون':'إضافة الزبون'}</button>{editingCustomerId&&<button type="button" className="secondary-button" onClick={()=>{setEditingCustomerId(null);setCustomerName('');setCustomerPhone('');setCustomerCity('');}}>إلغاء التعديل</button>}
          </form>
          <div className="customer-list">{customers.length === 0 ? <p className="hint">مازال ما تسجل حتى زبون.</p> : customers.map(customer => <article className="customer-row" key={customer.id}><div><strong>{customer.name}</strong><span>{customer.phone || customer.city || 'بدون معلومات إضافية'}</span></div><div><strong>{formatMad(customer.debt_minor)}</strong><span>الدين · {customer.invoice_count} فاتورة</span></div><button type="button" className="secondary-button" onClick={()=>{if(!requirePermission('manage_customers'))return;setEditingCustomerId(customer.id);setCustomerName(customer.name);setCustomerPhone(customer.phone??'');setCustomerCity(customer.city??'');setActiveSection('relations');}}>تعديل</button></article>)}</div>
        </section>
        <section data-section="inventory" className="panel movement-panel"><div className="panel-heading"><div><h3>سجل حركة المخزون</h3><p>آخر الحركات المسجلة بالتاريخ والوجهة</p></div><span className="step-mark">11</span></div>
          {movementHistory.length===0 ? <p className="hint">مازال ما تسجلات حتى حركة.</p> : <div className="movement-list">{movementHistory.map(movement=><article className="movement-row" key={movement.id}>
            <div><strong>{movement.product_name}</strong><span>{movement.movement_type==='purchase_receipt'?'توريد':movement.movement_type==='sale'?'بيع':movement.movement_type==='delivery'?'توزيع':movement.movement_type==='damage'?'تالف':movement.movement_type==='supplier_return'?'إرجاع للمورد':movement.movement_type==='stock_count'?'جرد':'حركة مخزون'} · {new Date(movement.occurred_at).toLocaleString('ar-MA')}</span><small>{movement.from_label ? 'من '+movement.from_label : ''}{movement.to_label ? ' ← '+movement.to_label : ''}{movement.note ? ' · '+movement.note : ''}</small></div>
            <strong>{movement.quantity}</strong>
          </article>)}</div>}
        </section>
        <section id="management-section" data-section="management" className="panel finance-panel"><div className="panel-heading"><div><h3>ملخص الحسابات</h3><p>إجمالي الفواتير المؤكدة منذ بداية الاستخدام</p></div><span className="step-mark">09</span></div>
          {financialSummary ? <div className="finance-grid">
            <article><span>المبيعات الصافية</span><strong>{formatMad(financialSummary.salesMinor)}</strong></article>
            <article><span>تكلفة البضاعة المباعة</span><strong>{formatMad(financialSummary.costMinor)}</strong></article>
            <article><span>الربح قبل المصاريف</span><strong>{formatSignedMad(financialSummary.grossProfitMinor)}</strong></article>
            <article><span>مصاريف التشغيل</span><strong>{formatMad(financialSummary.expensesMinor)}</strong></article>
            <article className="net-profit"><span>صافي الربح التقديري</span><strong>{formatSignedMad(financialSummary.netProfitMinor)}</strong></article>
            <article><span>الديون المستحقة</span><strong>{formatMad(financialSummary.outstandingMinor)}</strong></article>
          </div> : <p className="hint">الملخص المالي غير متوفر حالياً.</p>}
          <p className="hint">الربح كيراعي المرتجعات القابلة للبيع في تكلفة البضاعة، وكيطرح مصاريف التشغيل المسجلة. المرتجعات التالفة أو المنتهية كتبقى محسوبة ضمن التكلفة، والضرائب والمصاريف غير المسجلة ما داخلاش.</p>
        </section>
        <section data-section="management" className="panel expense-panel"><div className="panel-heading"><div><h3>مصاريف التشغيل</h3><p>سجل النقل والوقود والكراء والمصاريف الأخرى</p></div><span className="step-mark">10</span></div>
          <form onSubmit={submitExpense}>
            <label>تصنيف المصروف<select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}><option>نقل</option><option>وقود</option><option>كراء</option><option>أجور</option><option>صيانة</option><option>اتصالات</option><option>مصاريف أخرى</option></select></label>
            <label>المبلغ (DH)<input type="number" min="0.01" step="0.01" required value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} placeholder="0.00" /></label>
            <label>ملاحظة<input value={expenseNote} onChange={e => setExpenseNote(e.target.value)} placeholder="اختياري" /></label>
            <button className="primary-button" disabled={saving}>{saving ? 'كيتسجل المصروف...' : 'حفظ المصروف'}</button>
          </form>
        </section>
        <section data-section="inventory" className="panel alerts-panel"><div className="panel-heading"><div><h3>تنبيهات المخزون والصلاحية</h3><p>مراقبة النقص والدفعات اللي قربات تسالي</p></div><span className="step-mark">08</span></div>
          <div className="alert-group"><h4>مخزون منخفض</h4>
            {products.filter(product => product.low_stock_threshold > 0 && product.total_stock <= product.low_stock_threshold).length === 0
              ? <p className="hint">ما كاين حتى منتج تحت حد التنبيه.</p>
              : products.filter(product => product.low_stock_threshold > 0 && product.total_stock <= product.low_stock_threshold).map(product => <article className="alert-row" key={product.id}><div><strong>{product.name}</strong><span>حد التنبيه: {product.low_stock_threshold}</span></div><strong className="alert-value">{product.total_stock} متبقي</strong></article>)}
          </div>
          <div className="section-divider"></div>
          <div className="alert-group"><h4>دفعات بتاريخ الصلاحية</h4>
            {expiryAlerts.length === 0 ? <p className="hint">ما كايناش دفعات مسجلة بتاريخ صلاحية.</p> : expiryAlerts.map(batch => {
              const days = Math.ceil((new Date(batch.expiry_date + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000);
              return <article className="alert-row" key={batch.batch_id}><div><strong>{batch.product_name}</strong><span>{batch.batch_code || 'بدون رقم دفعة'} · {batch.location_label}</span></div><div className="alert-right"><strong>{batch.quantity}</strong><span className={days < 0 ? 'expired-label' : days <= 30 ? 'soon-label' : ''}>{days < 0 ? 'منتهية الصلاحية' : days === 0 ? 'تنتهي اليوم' : days + ' يوم متبقي'}</span><small>{batch.expiry_date}</small></div></article>;
            })}
          </div>
        </section>
        <section id="purchases-section" data-section="purchases" className="panel supplier-panel"><div className="panel-heading"><div><h3>الموردون والتوريدات</h3><p>إضافة مورد وتسجيل وصولات الشراء مع الصلاحية</p></div><span className="step-mark">07</span></div>
          <form onSubmit={submitSupplier}>
            <label>اسم المورد<input required value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="اسم الشركة أو الموزع" /></label>
            <label>الهاتف<input value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} placeholder="اختياري" /></label>
            <button className="secondary-button" disabled={saving}>{saving?'كيتم الحفظ...':editingSupplierId?'حفظ تعديل المورد':'إضافة المورد'}</button>{editingSupplierId&&<button type="button" className="secondary-button" onClick={()=>{setEditingSupplierId(null);setSupplierName('');setSupplierPhone('');}}>إلغاء التعديل</button>}
          </form>
          <div className="supplier-list">{suppliers.map(supplier => <article className="customer-row" key={supplier.id}><div><strong>{supplier.name}</strong><span>{supplier.phone || 'بدون هاتف'}</span></div><div><strong>{formatMad(supplier.purchased_minor)}</strong><span>{supplier.receipt_count} وصل شراء</span></div><button type="button" className="secondary-button" onClick={()=>{if(!requirePermission('manage_purchases'))return;setEditingSupplierId(supplier.id);setSupplierName(supplier.name);setSupplierPhone(supplier.phone??'');setActiveSection('purchases');}}>تعديل</button></article>)}</div>
          <div className="section-divider"></div>
          <form onSubmit={submitPurchase}>
            <label>المورد<select required value={purchaseSupplierId} onChange={e => setPurchaseSupplierId(e.target.value)}><option value="">اختار المورد</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            {purchaseLines.map((line,index)=><div className="purchase-line" key={index}>
              <label>المنتج<select required value={line.productId} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,productId:e.target.value}:item))}><option value="">اختار المنتج</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label><button type="button" className="secondary-button" onClick={()=>scanProductBarcode('purchase',index)}>مسح باركود المنتج</button>
              <div className="two-cols"><label>الكمية<input type="number" min="0.01" step="0.01" required value={line.quantity} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))} /></label><label>تكلفة الوحدة (DH)<input type="number" min="0" step="0.01" required value={line.unitCost} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,unitCost:e.target.value}:item))} /></label></div>
              <div className="two-cols"><label>رقم الدفعة<input value={line.batchCode} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,batchCode:e.target.value}:item))} placeholder="اختياري" /></label><label>تاريخ الصلاحية<input type="date" value={line.expiryDate} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,expiryDate:e.target.value}:item))} /></label></div>
              <button type="button" className="remove-line" disabled={purchaseLines.length===1} onClick={()=>setPurchaseLines(current=>current.filter((_,i)=>i!==index))}>حذف السطر</button>
            </div>)}
            <button type="button" className="secondary-button" onClick={()=>setPurchaseLines(current=>[...current,{productId:'',quantity:'1',unitCost:'',batchCode:'',expiryDate:''}])}>+ إضافة منتج لوصل الشراء</button>
            <button className="primary-button" disabled={saving || suppliers.length === 0 || products.length === 0 || purchaseLines.length===0}>{saving ? 'كيتسجل التوريد...' : 'تأكيد التوريد وإضافة المخزون'}</button>
          </form>
          <p className="hint">التوريد كيزيد المخزون ويحدث متوسط تكلفة الشراء. وصل الشراء والدفعات وحركة المخزون كيتسجلو فمعاملة واحدة.</p>
        </section>
        <section data-section="sales" className="panel collection-panel"><div className="panel-heading"><div><h3>تحصيل الديون</h3><p>تسجيل أداء لاحق على فاتورة سابقة</p></div><span className="step-mark">06</span></div>
          <form onSubmit={submitCollection}>
            <label>الفاتورة المستحقة<select required value={collectionInvoiceId} onChange={e => setCollectionInvoiceId(e.target.value)}><option value="">اختار الفاتورة</option>{outstandingInvoices.map(invoice => <option key={invoice.invoiceId} value={invoice.invoiceId}>{invoice.invoiceNumber} · {invoice.customerName} · باقي {formatMad(invoice.dueMinor)}</option>)}</select></label>
            <label>المبلغ المستخلص (DH)<input type="number" min="0.01" step="0.01" required value={collectionAmount} onChange={e => setCollectionAmount(e.target.value)} placeholder="0.00" /></label>
            <button className="primary-button" disabled={saving || outstandingInvoices.length === 0}>{saving ? 'كيتسجل الأداء...' : 'تأكيد تحصيل الدين'}</button>
          </form>
          {outstandingInvoices.length === 0 ? <p className="hint">ما كايناش فواتير جديدة فيها دين مستحق.</p> : <p className="hint">الفواتير القديمة غير المؤكدة ما كتدخلش فهاد اللائحة. ما يمكنش تحصيل مبلغ أكبر من الدين المتبقي.</p>}
        </section>
        <section id="sales-section" data-section="sales" className="panel sales-panel"><div className="panel-heading"><div><h3>فاتورة بيع جديدة</h3><p>فاتورة متعددة المنتجات مع تخفيض وأداء جزئي</p></div><span className="step-mark">05</span></div>
          <form onSubmit={submitSale}>
            <label>الزبون<select required value={saleCustomerId} onChange={e => setSaleCustomerId(e.target.value)}><option value="">اختار الزبون</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
            {saleLines.map((line,index)=><div className="sale-line" key={index}>
              <ProductCardPicker products={products} value={line.productId} onChange={value=>setSaleLines(current=>current.map((item,i)=>i===index?{...item,productId:value}:item))}/>
              <label>الكمية<input type="number" min="0.01" step="0.01" required value={line.quantity} onChange={e=>setSaleLines(current=>current.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))} /></label>
              <button type="button" className="remove-line" disabled={saleLines.length===1} onClick={()=>setSaleLines(current=>current.filter((_,i)=>i!==index))}>حذف السطر</button>
            </div>)}
            <button type="button" className="secondary-button" onClick={()=>setSaleLines(current=>[...current,{productId:'',quantity:'1'}])}>+ إضافة منتج للفاتورة</button>
            <label>التخفيض (DH)<input type="number" min="0" step="0.01" value={saleDiscount} onChange={e => setSaleDiscount(e.target.value)} /></label>
            <label>المبلغ المؤدى دابا (DH)<input type="number" min="0" step="0.01" value={saleCollected} onChange={e => setSaleCollected(e.target.value)} placeholder="0.00 إذا البيع بالدين" /></label>
            <button className="primary-button" disabled={saving || products.length === 0 || customers.length === 0 || saleLines.length===0}>{saving ? 'كتتسجل الفاتورة...' : 'تأكيد البيع وخصم المخزون'}</button>
          </form>
          <p className="hint">الفاتورة كتجمع عدة منتجات، وكتتسجل تفاصيل الثمن والتكلفة وكتنقص الكميات من المستودع. البيع كيرفض إلا ما كانش المخزون كافي.</p>
        </section>
        <section data-section="management" className="panel team-panel">
          <div className="panel-heading"><div><h3>تسليم نقدية المبيعات للديبو</h3><p>تتبع المبالغ اللي جمعها السائق وإصدار وصل عند تسليمها للمالك أو مسؤول الديبو</p></div><span className="step-mark">النقدية</span></div>
          <form onSubmit={submitCashHandover}>
            <label>السائق / جلسة التحصيل<select required value={handoverSessionId} onChange={e=>setHandoverSessionId(e.target.value)}><option value="">اختار جلسة مفتوحة</option>{cashSessions.filter(session=>session.status==='open').map(session=><option key={session.id} value={session.id}>{session.user_name} · {session.vehicle_label||'بدون سيارة'} · باقي {formatMad(session.expected_cash_minor-session.handed_cash_minor)}</option>)}</select></label>
            <label>المستلم فالديبو<select required value={handoverReceiverId} onChange={e=>setHandoverReceiverId(e.target.value)}><option value="">اختار المستلم</option>{teamUsers.filter(user=>user.is_active===1&&(user.role==='owner'||user.role==='depot_manager')).map(user=><option key={user.id} value={user.id}>{user.display_name} · {tr(roleLabels[user.role])}</option>)}</select></label>
            <label>المبلغ المسلم (DH)<input required type="number" min="0.01" step="0.01" value={handoverAmount} onChange={e=>setHandoverAmount(e.target.value)} /></label>
            <button className="primary-button" disabled={saving||cashSessions.every(session=>session.status!=='open')||teamUsers.every(user=>user.is_active!==1||(user.role!=='owner'&&user.role!=='depot_manager'))}>تأكيد تسليم النقدية وإصدار الوصل</button>
          </form>
          <div className="section-divider"></div><h4>جلسات التحصيل</h4>
          {cashSessions.length===0?<p className="hint">مازال ما تسجل حتى تحصيل نقدي من عمليات التوصيل.</p>:cashSessions.map(session=><article className="team-row" key={session.id}><div><strong>{session.user_name} · {session.vehicle_label||'بدون سيارة'}</strong><span>المفروض: {formatMad(session.expected_cash_minor)} · تسلم: {formatMad(session.handed_cash_minor)} · باقي: {formatMad(session.expected_cash_minor-session.handed_cash_minor)}</span><span>الحالة: {session.status==='open'?'مفتوحة':session.status==='submitted'?'تسلمات للديبو':'تمت المطابقة'}</span>{session.status==='reconciled'&&<span>النقد المعدود: {formatMad(Number(session.counted_cash_minor??0))} · الفرق: {formatSignedMad(Number(session.counted_cash_minor??0)-Number(session.expected_cash_minor))}{session.discrepancy_reason?' · السبب: '+session.discrepancy_reason:''}</span>}{session.status==='submitted'&&<div className="order-actions"><label>النقد المعدود فعلياً (DH)<input type="number" min="0" step="0.01" value={cashCountedAmounts[session.id]??''} onChange={e=>setCashCountedAmounts(current=>({...current,[session.id]:e.target.value}))}/></label><label>سبب الفرق إذا ما تطابقش<input value={cashDiscrepancyReasons[session.id]??''} onChange={e=>setCashDiscrepancyReasons(current=>({...current,[session.id]:e.target.value}))} placeholder="مثلاً: نقص نقدي أو خطأ فالعد"/></label><button type="button" className="secondary-button" disabled={saving} onClick={()=>reconcileCashSession(session)}>تأكيد المطابقة</button></div>}</div></article>)}
        </section>

        <section data-section="settings" className="panel team-panel settings-panel">
          <div className="panel-heading"><div><h3>{tr('settingsTitle')}</h3><p>{tr('settingsSubtitle')}</p></div><span className="step-mark">SYS</span></div>
          <div className="settings-group"><h4>{tr('settingsLanguageTitle')}</h4><p className="hint">{tr('settingsLanguageHint')}</p>
            <label>{tr('language')}<select value={language} onChange={event=>setLanguage(event.target.value as AppLanguage)}><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></select></label>
          </div>
          <div className="section-divider"></div>
          <div className="settings-group"><h4>{tr('settingsBusinessTitle')}</h4>
            <div className="settings-info-grid">
              <article><span>{tr('settingsCurrency')}</span><strong>MAD · DH</strong></article>
              <article><span>{tr('settingsStorage')}</span><strong>{tr('settingsOffline')}</strong></article>
              <article><span>{tr('settingsDatabase')}</span><strong>SQLite · SQLCipher</strong></article>
              <article><span>{tr('settingsVersion')}</span><strong>2.0 · Android</strong></article>
            </div><p className="hint">{tr('settingsBusinessHint')}</p>
          </div>
          <div className="section-divider"></div>
          <div className="settings-group"><h4>{tr('settingsDataTitle')}</h4><p className="hint">{tr('settingsDataHint')}</p>
            <button type="button" className="secondary-button" onClick={()=>setActiveSection('management')}>{tr('settingsOpenBackup')}</button>
          </div>
          <div className="section-divider"></div>
          <div className="settings-group"><h4>{tr('settingsSecurityTitle')}</h4>
            <ul className="settings-checklist"><li>{tr('settingsSecurityPin')}</li><li>{tr('settingsSecurityBackup')}</li><li>{tr('settingsSecurityOffline')}</li></ul>
          </div>
        </section>
        <InvoiceArchivePanel onSelect={invoice=>setLastInvoice(invoice)}/>
        <DistributionOperationsPanel user={currentUser} users={teamUsers} vehicles={teamVehicles} customers={customers} products={products}/>
      </div>}
      {currentUser&&(currentUser.role==='depot_manager'||currentUser.role==='delivery_driver'||currentUser.role==='van_sales')&&<div className="content-grid">{currentUser.role==='depot_manager'&&<InvoiceArchivePanel onSelect={invoice=>setLastInvoice(invoice)}/>}<DistributionOperationsPanel user={currentUser} users={teamUsers} vehicles={teamVehicles} customers={customers} products={products}/></div>}
      <footer>تطبيقي · بيانات التطوير محلية على الجهاز · لا تستعملها للمحاسبة الفعلية بعد</footer>
    </main>
  );
}