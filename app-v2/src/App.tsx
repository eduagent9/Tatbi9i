import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { formatMad, formatSignedMad, madToMinorUnits } from './data/money';
import { hashPin, isValidPin, verifyPin } from './data/auth';
import { canPerform, type AppPermission } from './data/permissions';
import { openAppDatabase } from './data/sqlite-database';
import { ProductRepository, type ProductRecord } from './data/products';
import { ProductImagesRepository } from './data/product-images';
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
import { PersonalOrdersPanel } from './operations/PersonalOrdersPanel';
import { SupplierAccountsPanel } from './operations/SupplierAccountsPanel';
import { DailyCashPanel } from './operations/DailyCashPanel';
import { InvoiceArchivePanel } from './operations/InvoiceArchivePanel';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

const MAIN_SECTIONS = ['home','sales','inventory','purchases','relations','management'] as const;
const emptyForm = { name: '', category: 'مواد غذائية', subcategory: '', unit: 'piece' as 'piece' | 'carton', pieces: '12', cost: '', price: '', threshold: '0', barcode: '' };
type AuthUser = { id:string; display_name:string; phone:string|null; role:'owner'; is_active:number; pin_salt:string|null; pin_hash:string|null };
const roleLabels:Record<'owner',string>={owner:'المالك'};

export default function App() {
  const [repository, setRepository] = useState<ProductRepository | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [stockLocations,setStockLocations]=useState<Array<{id:string;label:string}>>([]);
  const [saleLocationId,setSaleLocationId]=useState('loc-depot-main');
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlertRow[]>([]);
  const [movementHistory, setMovementHistory] = useState<StockMovementRecord[]>([]);
  const [authUsers,setAuthUsers]=useState<AuthUser[]>([]);
  const [currentUser,setCurrentUser]=useState<AuthUser|null>(null);
  const [authMode,setAuthMode]=useState<'loading'|'setup'|'login'>('loading');
  const [authPin,setAuthPin]=useState('');
  const [setupPin,setSetupPin]=useState('');
  const [setupPinConfirm,setSetupPinConfirm]=useState('');
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
  const [productImageData,setProductImageData]=useState<string>('');
  const [productImages,setProductImages]=useState<string[]>([]);
  const [loadingProductImages,setLoadingProductImages]=useState(false);
  const [productImagesLoadFailed,setProductImagesLoadFailed]=useState(false);
  const [primaryProductImage,setPrimaryProductImage]=useState(0);
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
  const [activeSection,setActiveSection]=useState<(typeof MAIN_SECTIONS)[number]>('home');
  const [productColumns,setProductColumns]=useState<1|2|3>(2);
  const swipeStartX=useRef<number|null>(null);
  const productImageLoadToken=useRef(0);
  const [catalogSearch,setCatalogSearch]=useState('');
  const [catalogGallery,setCatalogGallery]=useState<string[]>([]);
  const [catalogGalleryTitle,setCatalogGalleryTitle]=useState('');
  const [catalogGalleryIndex,setCatalogGalleryIndex]=useState(0);

  const refresh = useCallback(async (repo: ProductRepository) => setProducts(await repo.list()), []);
  const visibleProducts=useMemo(()=>products.filter(product=>[product.name,product.category??'',product.subcategory??'',product.barcode??''].some(value=>value.toLowerCase().includes(search.trim().toLowerCase()))),[products,search]);
  useEffect(() => {
    let alive = true;
    openAppDatabase().then(async db => {
      if (!alive) return;
      const repo = new ProductRepository(db);
      setRepository(repo);
      const locationsResult=await db.query("SELECT id,label FROM stock_locations WHERE is_active=1 ORDER BY CASE location_type WHEN 'depot' THEN 0 ELSE 1 END,label");
      setStockLocations((locationsResult.values??[]) as unknown as Array<{id:string;label:string}>);
      // Personal single-owner mode: only the local owner can enter the app.
      // Legacy team/vehicle rows are intentionally left untouched in SQLite.
      const usersResult=await db.query("SELECT id,display_name,phone,role,is_active,pin_salt,pin_hash FROM users WHERE id='local-owner' LIMIT 1");
      const owner=(usersResult.values??[])[0] as unknown as AuthUser|undefined;
      setAuthUsers(owner?[owner]:[]);
      setAuthMode(owner?.pin_hash&&owner?.pin_salt?'login':'setup');
      await refresh(repo);
      setCustomers(await new CustomerRepository(db).list());
      setOutstandingInvoices(await new PaymentRepository(db).listOutstanding());
      setSuppliers(await new SupplierRepository(db).list());
      setExpiryAlerts(await new StockRepository(db).getExpiryAlerts());
      setMovementHistory(await new StockRepository(db).getRecentMovements());
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
    }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'تعذر فتح قاعدة البيانات.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refresh]);

  async function scanProductBarcode(target:'product'|'sale'|'purchase'|'stock'='product',index=0){
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
    const user=authUsers.find(item=>item.id==='local-owner'&&item.is_active===1);
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
        customerId: saleCustomerId, sellerUserId: currentUser?.id??'local-owner', locationId: saleLocationId,
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

  async function openCatalogGallery(product:ProductRecord){
    try{const db=await openAppDatabase();const rows=await new ProductImagesRepository(db).list(product.id);const images=rows.map(row=>row.image_data_uri);setCatalogGallery(images.length?images:(product.image_data_uri?[product.image_data_uri]:[]));setCatalogGalleryTitle(product.name);setCatalogGalleryIndex(0);}
    catch(reason){setError(reason instanceof Error?reason.message:'تعذر فتح صور المنتج.');}
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
        lowStockThreshold:Number(form.threshold),barcode:form.barcode,imageDataUri:(productImages[primaryProductImage]??productImageData)||null};
      if(editingProductId)await repository.update(input);else await repository.create(input);
      const db=await openAppDatabase();
      await new ProductImagesRepository(db).replace(input.id,productImages,primaryProductImage);
      productImageLoadToken.current+=1;setLoadingProductImages(false);setProductImagesLoadFailed(false);await refresh(repository);setForm(emptyForm);setProductImageData('');setProductImages([]);setPrimaryProductImage(0);setEditingProductId(null);setNotice(editingProductId?'تحدّث المنتج بلا ما تبدل تاريخ الفواتير أو المخزون.':'تسجل المنتج بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر حفظ المنتج.'); }
    finally { setSaving(false); }
  }

  return (
    <main className="app-shell personal-mode" dir="rtl">
      <header className="topbar"><div><span className="brand-mark">ت</span><div><p className="eyebrow">إدارة نشاطك التجاري الشخصي</p><h1>تطبيقي</h1></div></div><div className="topbar-actions">{currentUser&&<><span className="mode-tag">{currentUser.display_name} · {roleLabels[currentUser.role]}</span><button type="button" className="secondary-button" onClick={logoutUser}>خروج</button></>}<span className="mode-tag">نسخة تطوير</span></div></header>
      <section className="page-heading"><div><p className="eyebrow">إدارة نشاطك الشخصي</p><h2>{currentUser?.role==='owner'?({home:'الرئيسية',sales:'المبيعات',inventory:'المخزون والمنتجات',purchases:'المشتريات',relations:'العلاقات',management:'الإدارة والتقارير'} as const)[activeSection]:'مساحة العمل'}</h2><p>{currentUser?.role==='owner'?'البيع والمخزون والمشتريات والحسابات في مكان واحد':'مرحبا بك في مساحة العمل الخاصة بدورك'}</p></div><div className="total-card"><strong>{products.length}</strong><span>منتج مسجل</span></div></section>
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
      {!loading&&!currentUser&&authMode==='login'&&<section className="panel auth-panel"><div className="panel-heading"><div><h3>تسجيل الدخول</h3><p>دخل رمز PIN ديال المالك.</p></div></div><form onSubmit={loginUser}><label>الحساب<input value="المالك" disabled /></label><label>رمز PIN<input type="password" inputMode="numeric" autoComplete="current-password" maxLength={8} required value={authPin} onChange={e=>setAuthPin(e.target.value)} /></label><button className="primary-button" disabled={saving}>{saving?'كيتم التحقق...':'دخول'}</button></form></section>}
      {currentUser?.role==='owner'&&repository && <div className="content-grid section-view" data-active-section={activeSection} onTouchStart={event=>{swipeStartX.current=event.changedTouches[0]?.clientX??null;}} onTouchEnd={event=>{const start=swipeStartX.current;swipeStartX.current=null;if(start===null)return;const delta=event.changedTouches[0].clientX-start;if(Math.abs(delta)<75)return;const current=MAIN_SECTIONS.indexOf(activeSection);const next=current+(delta<0?1:-1);if(next>=0&&next<MAIN_SECTIONS.length)setActiveSection(MAIN_SECTIONS[next]);}}>
        <section data-section="home" className="dashboard-overview">
          <div className="dashboard-welcome"><div><p className="eyebrow">نظرة عامة</p><h3>مرحبا {currentUser.display_name}</h3><p>ها ملخص النشاط ديالك، وتقدر تمشي مباشرة لأي عملية.</p></div><span className="dashboard-date">{new Date().toLocaleDateString('ar-MA',{weekday:'long',day:'numeric',month:'long'})}</span></div>
          <div className="dashboard-metrics">
            <article><span>المبيعات الصافية</span><strong>{formatMad(financialSummary?.salesMinor??0)}</strong><small>منذ بداية الاستخدام</small></article>
            <article><span>صافي الربح التقديري</span><strong>{formatSignedMad(financialSummary?.netProfitMinor??0)}</strong><small>بعد مصاريف التشغيل</small></article>
            <article><span>الديون المستحقة</span><strong>{formatMad(financialSummary?.outstandingMinor??0)}</strong><small>{outstandingInvoices.length} فاتورة فيها باقي</small></article>
            <article><span>المنتجات المسجلة</span><strong>{products.length}</strong><small>{products.filter(product=>product.low_stock_threshold>0&&product.total_stock<=product.low_stock_threshold).length} منتجات تحت حد التنبيه</small></article>
          </div>
          <div className="dashboard-shortcuts"><div className="panel-heading"><div><h3>اختصارات سريعة</h3><p>وصل مباشرة للخدمة اللي محتاج</p></div></div><div className="shortcut-grid">
            <button type="button" onClick={()=>setActiveSection('sales')}><b>＋</b><span>بيع جديد</span></button>
            <button type="button" onClick={()=>setActiveSection('sales')}><b>⇢</b><span>طلب جديد</span></button><button type="button" onClick={()=>setActiveSection('inventory')}><b>▦</b><span>إدارة المخزون</span></button>
            <button type="button" onClick={()=>setActiveSection('purchases')}><b>⇩</b><span>تسجيل توريد</span></button>
            <button type="button" onClick={()=>setActiveSection('relations')}><b>♙</b><span>الزبناء والديون</span></button>
            <button type="button" onClick={()=>setActiveSection('management')}><b>▤</b><span>التقارير والإدارة</span></button>
          </div></div>
          <div className="dashboard-bottom"><article><strong>حركات المخزون</strong><b>{movementHistory.length}</b><span>آخر الحركات المسجلة</span></article><article><strong>تنبيهات الصلاحية</strong><b>{expiryAlerts.length}</b><span>دفعات مسجلة بتاريخ صلاحية</span></article><article><strong>فواتير مؤكدة</strong><b>{financialSummary?.invoiceCount??0}</b><span>إجمالي الفواتير</span></article></div>
        </section>
        <section data-section="inventory" className="panel catalog-panel">
          <div className="panel-heading"><div><h3>معرض المنتجات</h3><p>تصفح صور المنتجات ومعلوماتها بدون إظهار كميات المخزون</p></div><span className="step-mark">{products.length}</span></div>
          <input className="search-input" value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} placeholder="قلب على منتج بالاسم أو الصنف أو الباركود..."/>
          <div className="personal-product-grid" style={{gridTemplateColumns:`repeat(${productColumns},minmax(0,1fr))`}}>{products.filter(product=>[product.name,product.category??'',product.subcategory??'',product.barcode??''].some(value=>value.toLowerCase().includes(catalogSearch.toLowerCase()))).map(product=><article className="personal-product-card" key={product.id}>
            <div className="personal-product-image" role="button" tabIndex={0} onClick={()=>openCatalogGallery(product)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCatalogGallery(product);}}}>{product.image_data_uri?<img src={product.image_data_uri} alt={product.name}/>:<div className="personal-product-placeholder">صورة المنتج</div>}</div>
            <div className="personal-product-info"><strong>{product.name}</strong><span>{formatMad(product.sale_price_minor)} · {product.total_stock>0?'متوفر':'غير متوفر'}</span></div>
          </article>)}</div>
          {catalogGallery.length>0&&<div className="product-gallery-lightbox" role="dialog" aria-modal="true" aria-label={'صور '+catalogGalleryTitle} onClick={()=>setCatalogGallery([])}><button type="button" className="gallery-close" aria-label="إغلاق" onClick={()=>setCatalogGallery([])}>×</button><button type="button" className="gallery-arrow" disabled={catalogGallery.length<2} onClick={e=>{e.stopPropagation();setCatalogGalleryIndex(i=>(i-1+catalogGallery.length)%catalogGallery.length);}}>‹</button><figure onClick={e=>e.stopPropagation()}><img src={catalogGallery[catalogGalleryIndex]} alt={catalogGalleryTitle}/><figcaption>{catalogGalleryTitle} · {catalogGalleryIndex+1}/{catalogGallery.length}</figcaption></figure><button type="button" className="gallery-arrow" disabled={catalogGallery.length<2} onClick={e=>{e.stopPropagation();setCatalogGalleryIndex(i=>(i+1)%catalogGallery.length);}}>›</button></div>}
        </section>
        <section id="inventory-section" data-section="inventory" className="panel form-panel"><div className="panel-heading"><div><h3>إضافة منتج</h3><p>المبالغ بالدرهم المغربي</p></div><span className="step-mark">01</span></div>
          <form onSubmit={submit}>
            <label>اسم المنتج<input required value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="مثال: ماء معدني 1.5L" /></label>
            <div className="two-cols"><label>الصنف<select value={form.category} onChange={e => setForm({...form,category:e.target.value})}><option>مواد غذائية</option><option>مشروبات</option><option>مواد التنظيف</option><option>العناية والتجميل</option><option>مواد منزلية</option><option>متنوعات</option></select></label><label>الصنف الفرعي<input value={form.subcategory} onChange={e => setForm({...form,subcategory:e.target.value})} placeholder="اختياري" /></label></div>
            <div className="two-cols"><label>وحدة البيع<select value={form.unit} onChange={e => setForm({...form,unit:e.target.value as 'piece'|'carton'})}><option value="piece">قطعة</option><option value="carton">كرتونة</option></select></label>{form.unit === 'carton' && <label>القطع في الكرتونة<input type="number" min="1" step="1" required value={form.pieces} onChange={e => setForm({...form,pieces:e.target.value})} /></label>}</div>
            <div className="two-cols"><label>ثمن الشراء (DH)<input type="number" min="0" step="0.01" required value={form.cost} onChange={e => setForm({...form,cost:e.target.value})} placeholder="0.00" /></label><label>ثمن البيع (DH)<input type="number" min="0" step="0.01" required value={form.price} onChange={e => setForm({...form,price:e.target.value})} placeholder="0.00" /></label></div>
            <div className="two-cols"><label>حد التنبيه للمخزون<input type="number" min="0" step="0.01" value={form.threshold} onChange={e => setForm({...form,threshold:e.target.value})} /></label><label>الباركود<input value={form.barcode} onChange={e => setForm({...form,barcode:e.target.value})} placeholder="اختياري" /></label></div>
            <label>صور المنتج (حتى 5 صور)<input type="file" accept="image/*" multiple disabled={saving||loadingProductImages} onChange={async e=>{const files=Array.from(e.currentTarget.files??[]);e.currentTarget.value='';if(!files.length)return;if(files.length+productImages.length>5){setError('الحد الأقصى هو 5 صور للمنتج.');return;}if(files.some(file=>!file.type.startsWith('image/')||file.size>1500000)){setError('اختار صوراً صالحة، حجم كل صورة أقل من 1.5 MB.');return;}try{const values=await Promise.all(files.map(file=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const value=String(reader.result??'');value.startsWith('data:image/')?resolve(value):reject(new Error('تعذر قراءة صورة.'));};reader.onerror=()=>reject(new Error('تعذر قراءة صورة.'));reader.readAsDataURL(file);})));setProductImages(current=>[...current,...values]);if(!productImages.length){setProductImageData(values[0]);setPrimaryProductImage(0);}}catch(reason){setError(reason instanceof Error?reason.message:'تعذر قراءة الصور.');}}} /></label>
            {productImages.length>0&&<div className="product-gallery-preview">{productImages.map((src,index)=><div className="product-image-preview" key={index}><img src={src} alt={'صورة المنتج '+(index+1)}/><button type="button" className={primaryProductImage===index?'primary-button':'secondary-button'} onClick={()=>{setPrimaryProductImage(index);setProductImageData(src);}}>{primaryProductImage===index?'الصورة الرئيسية':'اجعلها رئيسية'}</button><button type="button" className="remove-line" onClick={()=>{setProductImages(current=>current.filter((_,i)=>i!==index));if(primaryProductImage===index){setPrimaryProductImage(0);setProductImageData(productImages.filter((_,i)=>i!==index)[0]??'');}else if(primaryProductImage>index)setPrimaryProductImage(primaryProductImage-1);}}>حذف</button></div>)}</div>}
            <button type="button" className="secondary-button barcode-scan-trigger" disabled={saving||barcodeScanning} onClick={()=>scanProductBarcode('product')}>مسح الباركود بالكاميرا</button>
            <button className="primary-button" disabled={saving||loadingProductImages||productImagesLoadFailed}>{loadingProductImages?'كيتم تحميل صور المنتج...':productImagesLoadFailed?'عاود فتح تعديل المنتج لتحميل الصور':saving ? 'كيتم الحفظ...' : editingProductId?'حفظ التعديلات':'حفظ المنتج'}</button>
            {editingProductId&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>{productImageLoadToken.current+=1;setLoadingProductImages(false);setProductImagesLoadFailed(false);setEditingProductId(null);setForm(emptyForm);setProductImageData('');setProductImages([]);setPrimaryProductImage(0);}}>إلغاء التعديل</button>}
          </form>
        </section>
        <section data-section="inventory" className="panel list-panel"><div className="panel-heading"><div><h3>لائحة المنتجات</h3><p>المخزون الحالي بالمستودع</p></div><span className="step-mark">02</span></div>
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="قلب بالاسم أو الصنف أو الباركود..." />
          {visibleProducts.length === 0 ? <div className="empty-state"><span>📦</span><strong>ما كاين حتى منتج دابا</strong><p>بدا بإضافة أول منتج من الاستمارة.</p></div> : <div className="product-list">{visibleProducts.map(product => <article className="product-row" key={product.id}><div className="product-icon">▦</div><div className="product-info"><strong>{product.name}</strong><span>{product.category || 'بدون صنف'}{product.barcode ? ` · ${product.barcode}` : ''}</span></div><div className="product-numbers"><strong>{formatMad(product.sale_price_minor)}</strong><span>المخزون: {product.total_stock}</span><button type="button" className="secondary-button" onClick={()=>{if(!requirePermission('manage_products'))return;setEditingProductId(product.id);setProductImageData(product.image_data_uri??'');setProductImages(product.image_data_uri?[product.image_data_uri]:[]);setPrimaryProductImage(0);const imageLoadToken=++productImageLoadToken.current;setProductImagesLoadFailed(false);setLoadingProductImages(true);openAppDatabase().then(db=>new ProductImagesRepository(db).list(product.id)).then(images=>{if(productImageLoadToken.current!==imageLoadToken)return;if(images.length){setProductImages(images.map(image=>image.image_data_uri));setPrimaryProductImage(Math.max(0,images.findIndex(image=>image.is_primary===1)));}}).catch(reason=>{if(productImageLoadToken.current===imageLoadToken){setProductImagesLoadFailed(true);setError(reason instanceof Error?reason.message:'تعذر تحميل صور المنتج.');}}).finally(()=>{if(productImageLoadToken.current===imageLoadToken)setLoadingProductImages(false);});setForm({name:product.name,category:product.category??'مواد غذائية',subcategory:product.subcategory??'',unit:product.base_unit==='carton'?'carton':'piece',pieces:String(product.pieces_per_carton??12),cost:(product.purchase_cost_minor/100).toFixed(2),price:(product.sale_price_minor/100).toFixed(2),threshold:String(product.low_stock_threshold),barcode:product.barcode??''});setActiveSection('inventory');}}>تعديل</button></div></article>)}</div>}
        </section>
        <StockAndReturnsPanel />
        <DataBackupPanel />
        <section data-section="inventory" className="panel stock-panel"><div className="panel-heading"><div><h3>حركة المخزون</h3><p>إدخال أو إخراج الكمية من المستودع الرئيسي</p></div><span className="step-mark">03</span></div>
          <form onSubmit={submitStock}>
            <label>المنتج<select required value={stockProductId} onChange={e => setStockProductId(e.target.value)}><option value="">اختار المنتج</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button type="button" className="secondary-button" onClick={()=>scanProductBarcode('stock')}>مسح باركود المنتج</button>
            <div className="two-cols"><label>نوع الحركة<select value={stockDirection} onChange={e => setStockDirection(e.target.value as 'in'|'out')}><option value="in">إدخال للمستودع</option><option value="out">إخراج من المستودع</option></select></label><label>الكمية<input type="number" min="0.01" step="0.01" required value={stockQuantity} onChange={e => setStockQuantity(e.target.value)} /></label></div>
            {stockDirection === 'out' && <label>سبب الإخراج<select value={stockOutType} onChange={e => setStockOutType(e.target.value as 'delivery'|'damage'|'supplier_return')}><option value="delivery">خروج مخزون</option><option value="damage">تالف</option><option value="supplier_return">إرجاع للمورد</option></select></label>}
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
            <div><strong>{movement.product_name}</strong><span>{movement.movement_type==='purchase_receipt'?'توريد':movement.movement_type==='sale'?'بيع':movement.movement_type==='delivery'?'خروج مخزون':movement.movement_type==='damage'?'تالف':movement.movement_type==='supplier_return'?'إرجاع للمورد':movement.movement_type==='stock_count'?'جرد':'حركة مخزون'} · {new Date(movement.occurred_at).toLocaleString('ar-MA')}</span><small>{movement.from_label ? 'من '+movement.from_label : ''}{movement.to_label ? ' ← '+movement.to_label : ''}{movement.note ? ' · '+movement.note : ''}</small></div>
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
        <DailyCashPanel ownerId={currentUser.id}/>
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
          <SupplierAccountsPanel ownerId={currentUser.id} suppliers={suppliers}/>
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
            <label>مكان البيع<select required value={saleLocationId} onChange={e=>setSaleLocationId(e.target.value)}>{stockLocations.map(location=><option key={location.id} value={location.id}>{location.label}</option>)}</select></label>
            <label>الزبون<select required value={saleCustomerId} onChange={e => setSaleCustomerId(e.target.value)}><option value="">اختار الزبون</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
            {saleLines.map((line,index)=><div className="sale-line" key={index}>
              <label>المنتج<select required value={line.productId} onChange={e=>setSaleLines(current=>current.map((item,i)=>i===index?{...item,productId:e.target.value}:item))}><option value="">اختار المنتج</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} · {formatMad(product.sale_price_minor)}</option>)}</select></label>
              <label>الكمية<input type="number" min="0.01" step="0.01" required value={line.quantity} onChange={e=>setSaleLines(current=>current.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))} /></label>
              <button type="button" className="remove-line" disabled={saleLines.length===1} onClick={()=>setSaleLines(current=>current.filter((_,i)=>i!==index))}>حذف السطر</button>
            </div>)}
            <button type="button" className="secondary-button" onClick={()=>setSaleLines(current=>[...current,{productId:'',quantity:'1'}])}>+ إضافة منتج للفاتورة</button>
            <label>التخفيض (DH)<input type="number" min="0" step="0.01" value={saleDiscount} onChange={e => setSaleDiscount(e.target.value)} /></label>
            <label>المبلغ المؤدى دابا (DH)<input type="number" min="0" step="0.01" value={saleCollected} onChange={e => setSaleCollected(e.target.value)} placeholder="0.00 إذا البيع بالدين" /></label>
            <button className="primary-button" disabled={saving || products.length === 0 || customers.length === 0 || saleLines.length===0}>{saving ? 'كتتسجل الفاتورة...' : 'تأكيد البيع وخصم المخزون'}</button>
          </form>
          <p className="hint">اختار المستودع أو السيارة كمصدر للبيع؛ الفاتورة كتنقص الكمية من المكان المختار فقط، وكتسجل المبيعات والديون بشكل مستقل.</p>
        </section>
        <PersonalOrdersPanel ownerId={currentUser.id} customers={customers} productColumns={productColumns} onProductColumnsChange={setProductColumns} onChanged={async()=>{if(repository){await refresh(repository);const db=await openAppDatabase();setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());setOutstandingInvoices(await new PaymentRepository(db).listOutstanding());setMovementHistory(await new StockRepository(db).getRecentMovements());}}}/>
        <InvoiceArchivePanel onSelect={invoice=>setLastInvoice(invoice)}/>
      </div>}
      <footer>تطبيقي · بيانات التطوير محلية على الجهاز · لا تستعملها للمحاسبة الفعلية بعد</footer>
    </main>
  );
}