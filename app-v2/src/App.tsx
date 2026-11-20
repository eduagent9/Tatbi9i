import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatMad, formatSignedMad, madToMinorUnits } from './data/money';
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

const emptyForm = { name: '', category: 'مواد غذائية', subcategory: '', unit: 'piece' as 'piece' | 'carton', pieces: '12', cost: '', price: '', threshold: '0', barcode: '' };
type TeamUser = { id:string; display_name:string; phone:string|null; role:'owner'|'depot_manager'|'order_rep'|'van_sales'|'delivery_driver'; is_active:number };
type TeamVehicle = { id:string; code:string; label:string; vehicle_type:'van_sales'|'delivery'; assigned_user_id:string|null; assigned_name:string|null };
const roleLabels:Record<TeamUser['role'],string>={owner:'المالك',depot_manager:'مسؤول الديبو',order_rep:'مندوب الطلبات',van_sales:'مندوب البيع بالسيارة',delivery_driver:'السائق'};

export default function App() {
  const [repository, setRepository] = useState<ProductRepository | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<ExpiryAlertRow[]>([]);
  const [movementHistory, setMovementHistory] = useState<StockMovementRecord[]>([]);
  const [teamUsers,setTeamUsers]=useState<TeamUser[]>([]);
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
  const [supplierPhone, setSupplierPhone] = useState('');
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<Array<{productId:string;quantity:string;unitCost:string;batchCode:string;expiryDate:string}>>([{productId:'',quantity:'1',unitCost:'',batchCode:'',expiryDate:''}]);
  const [collectionInvoiceId, setCollectionInvoiceId] = useState('');
  const [collectionAmount, setCollectionAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleLines, setSaleLines] = useState<Array<{productId:string;quantity:string}>>([{productId:'',quantity:'1'}]);
  const [saleDiscount, setSaleDiscount] = useState('0');
  const [saleCollected, setSaleCollected] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [stockProductId, setStockProductId] = useState('');
  const [stockQuantity, setStockQuantity] = useState('1');
  const [stockDirection, setStockDirection] = useState<'in' | 'out'>('in');
  const [stockOutType, setStockOutType] = useState<'delivery' | 'damage' | 'supplier_return'>('delivery');

  const refresh = useCallback(async (repo: ProductRepository) => setProducts(await repo.list()), []);
  useEffect(() => {
    let alive = true;
    openAppDatabase().then(async db => {
      if (!alive) return;
      const repo = new ProductRepository(db);
      setRepository(repo);
      const [usersResult,vehiclesResult]=await Promise.all([
        db.query("SELECT id,display_name,phone,role,is_active FROM users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'depot_manager' THEN 1 ELSE 2 END,display_name"),
        db.query("SELECT v.id,v.code,v.label,v.vehicle_type,v.assigned_user_id,u.display_name AS assigned_name FROM vehicles v LEFT JOIN users u ON u.id=v.assigned_user_id WHERE v.is_active=1 ORDER BY v.code")
      ]);
      setTeamUsers((usersResult.values??[]) as unknown as TeamUser[]);
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
  }, [refresh]);

  async function submitTeamMember(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const cleanName=teamName.trim();
    if(!cleanName){setError('اسم المستخدم مطلوب.');return;}
    setError('');setNotice('');setSaving(true);
    try{
      const db=await openAppDatabase(),now=new Date().toISOString(),id=crypto.randomUUID();
      await db.run('INSERT INTO users (id,display_name,phone,role,is_active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)',[id,cleanName,teamPhone.trim()||null,teamRole,now,now]);
      const result=await db.query('SELECT id,display_name,phone,role,is_active FROM users ORDER BY display_name');
      setTeamUsers((result.values??[]) as unknown as TeamUser[]);
      setTeamName('');setTeamPhone('');
      setNotice('تسجل عضو الفريق بنجاح.');
    }catch(reason){setError(reason instanceof Error?reason.message:'تعذر تسجيل عضو الفريق.');}
    finally{setSaving(false);}
  }

  async function saveVehicleAssignment(vehicle:TeamVehicle){
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
    event.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      await new CustomerRepository(db).create({
        id: crypto.randomUUID(), name: customerName, phone: customerPhone, city: customerCity,
      });
      setCustomers(await new CustomerRepository(db).list());
      setCustomerName(''); setCustomerPhone(''); setCustomerCity('');
      setNotice('تسجل الزبون بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر حفظ الزبون.'); }
    finally { setSaving(false); }
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      await new ExpenseRepository(db).create({
        id: crypto.randomUUID(), expenseNumber: 'EXP-' + Date.now(),
        category: expenseCategory, amountMinor: madToMinorUnits(Number(expenseAmount)),
        paymentMethod: 'cash', paidBy: 'local-owner', note: expenseNote,
      });
      setFinancialSummary(await new ReportsRepository(db).getFinancialSummary());
      setExpenseAmount(''); setExpenseNote('');
      setNotice('تسجل المصروف وتحدث صافي الربح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل المصروف.'); }
    finally { setSaving(false); }
  }

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      await new SupplierRepository(db).create({ id: crypto.randomUUID(), name: supplierName, phone: supplierPhone });
      setSuppliers(await new SupplierRepository(db).list());
      setSupplierName(''); setSupplierPhone('');
      setNotice('تسجل المورد بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر حفظ المورد.'); }
    finally { setSaving(false); }
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purchaseSupplierId || purchaseLines.length===0 || purchaseLines.some(line=>!line.productId||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0||!Number.isFinite(Number(line.unitCost))||Number(line.unitCost)<0)) { setError('اختار المورد والمنتجات وتأكد من الكميات والتكاليف.'); return; }
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      const result = await new PurchaseRepository(db).create({
        id: crypto.randomUUID(), receiptNumber: 'ACH-' + Date.now(),
        supplierId: purchaseSupplierId, receivedBy: 'local-owner', locationId: 'loc-depot-main',
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
    event.preventDefault();
    if (!collectionInvoiceId) { setError('اختار الفاتورة أولاً.'); return; }
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      const result = await new PaymentRepository(db).collect({
        id: crypto.randomUUID(), invoiceId: collectionInvoiceId,
        amountMinor: madToMinorUnits(Number(collectionAmount)),
        method: 'cash', receivedBy: 'local-owner',
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
    event.preventDefault();
    if (!saleCustomerId || saleLines.length===0 || saleLines.some(line=>!line.productId||!Number.isFinite(Number(line.quantity))||Number(line.quantity)<=0)) { setError('اختار الزبون والمنتجات وتأكد من الكميات.'); return; }
    setError(''); setNotice(''); setSaving(true);
    try {
      const db = await openAppDatabase();
      const discountMinor = madToMinorUnits(Number(saleDiscount || 0));
      const collectedMinor = madToMinorUnits(Number(saleCollected || 0));
      const result = await new SalesRepository(db).create({
        id: crypto.randomUUID(), invoiceNumber: 'T-' + Date.now(),
        customerId: saleCustomerId, sellerUserId: 'local-owner', locationId: 'loc-depot-main',
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
      setNotice('تسجلات الفاتورة ' + result.invoiceNumber + ' بنجاح. المتبقي على الزبون: ' + formatMad(result.dueMinor));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الفاتورة.'); }
    finally { setSaving(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository) return;
    setError(''); setNotice(''); setSaving(true);
    try {
      await repository.create({
        id: crypto.randomUUID(), name: form.name, category: form.category, subcategory: form.subcategory,
        baseUnit: form.unit, piecesPerCarton: form.unit === 'carton' ? Number(form.pieces) : null,
        purchaseCostMinor: madToMinorUnits(Number(form.cost)), salePriceMinor: madToMinorUnits(Number(form.price)),
        lowStockThreshold: Number(form.threshold), barcode: form.barcode,
      });
      await refresh(repository); setForm(emptyForm); setNotice('تسجل المنتج بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر حفظ المنتج.'); }
    finally { setSaving(false); }
  }

  return (
    <main className="app-shell" dir="rtl">
      <header className="topbar"><div><span className="brand-mark">ت</span><div><p className="eyebrow">إدارة التوزيع والمبيعات</p><h1>تطبيقي</h1></div></div><span className="mode-tag">نسخة تطوير</span></header>
      <section className="page-heading"><div><p className="eyebrow">المخزون</p><h2>المنتجات</h2><p>سجل المنتجات والأسعار والباركود ووحدات البيع</p></div><div className="total-card"><strong>{products.length}</strong><span>منتج مسجل</span></div></section>
      {loading && <div className="message">كنوجد قاعدة البيانات...</div>}
      {!loading && error && <div className="message error" role="alert">{error}<small>المعاينة فالمتصفح ما كتخزنش البيانات؛ افتح تطبيق Android المبني باش تجرب SQLite.</small></div>}
      {notice && <div className="message success" role="status">{notice}</div>}
      {repository && <div className="content-grid">
        <section className="panel form-panel"><div className="panel-heading"><div><h3>إضافة منتج</h3><p>المبالغ بالدرهم المغربي</p></div><span className="step-mark">01</span></div>
          <form onSubmit={submit}>
            <label>اسم المنتج<input required value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="مثال: ماء معدني 1.5L" /></label>
            <div className="two-cols"><label>الصنف<select value={form.category} onChange={e => setForm({...form,category:e.target.value})}><option>مواد غذائية</option><option>مشروبات</option><option>مواد التنظيف</option><option>العناية والتجميل</option><option>مواد منزلية</option><option>متنوعات</option></select></label><label>الصنف الفرعي<input value={form.subcategory} onChange={e => setForm({...form,subcategory:e.target.value})} placeholder="اختياري" /></label></div>
            <div className="two-cols"><label>وحدة البيع<select value={form.unit} onChange={e => setForm({...form,unit:e.target.value as 'piece'|'carton'})}><option value="piece">قطعة</option><option value="carton">كرتونة</option></select></label>{form.unit === 'carton' && <label>القطع في الكرتونة<input type="number" min="1" step="1" required value={form.pieces} onChange={e => setForm({...form,pieces:e.target.value})} /></label>}</div>
            <div className="two-cols"><label>ثمن الشراء (DH)<input type="number" min="0" step="0.01" required value={form.cost} onChange={e => setForm({...form,cost:e.target.value})} placeholder="0.00" /></label><label>ثمن البيع (DH)<input type="number" min="0" step="0.01" required value={form.price} onChange={e => setForm({...form,price:e.target.value})} placeholder="0.00" /></label></div>
            <div className="two-cols"><label>حد التنبيه للمخزون<input type="number" min="0" step="0.01" value={form.threshold} onChange={e => setForm({...form,threshold:e.target.value})} /></label><label>الباركود<input value={form.barcode} onChange={e => setForm({...form,barcode:e.target.value})} placeholder="اختياري" /></label></div>
            <button className="primary-button" disabled={saving}>{saving ? 'كيتم الحفظ...' : 'حفظ المنتج'}</button>
          </form>
        </section>
        <section className="panel list-panel"><div className="panel-heading"><div><h3>لائحة المنتجات</h3><p>المخزون الحالي مجموع المستودع والسيارات</p></div><span className="step-mark">02</span></div>
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="قلب بالاسم أو الصنف أو الباركود..." />
          {visibleProducts.length === 0 ? <div className="empty-state"><span>📦</span><strong>ما كاين حتى منتج دابا</strong><p>بدا بإضافة أول منتج من الاستمارة.</p></div> : <div className="product-list">{visibleProducts.map(product => <article className="product-row" key={product.id}><div className="product-icon">▦</div><div className="product-info"><strong>{product.name}</strong><span>{product.category || 'بدون صنف'}{product.barcode ? ` · ${product.barcode}` : ''}</span></div><div className="product-numbers"><strong>{formatMad(product.sale_price_minor)}</strong><span>المخزون: {product.total_stock}</span></div></article>)}</div>}
        </section>
        <StockAndReturnsPanel />
        <DataBackupPanel />
        <section className="panel stock-panel"><div className="panel-heading"><div><h3>حركة المخزون</h3><p>إدخال أو إخراج الكمية من المستودع الرئيسي</p></div><span className="step-mark">03</span></div>
          <form onSubmit={submitStock}>
            <label>المنتج<select required value={stockProductId} onChange={e => setStockProductId(e.target.value)}><option value="">اختار المنتج</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <div className="two-cols"><label>نوع الحركة<select value={stockDirection} onChange={e => setStockDirection(e.target.value as 'in'|'out')}><option value="in">إدخال للمستودع</option><option value="out">إخراج من المستودع</option></select></label><label>الكمية<input type="number" min="0.01" step="0.01" required value={stockQuantity} onChange={e => setStockQuantity(e.target.value)} /></label></div>
            {stockDirection === 'out' && <label>سبب الإخراج<select value={stockOutType} onChange={e => setStockOutType(e.target.value as 'delivery'|'damage'|'supplier_return')}><option value="delivery">تسليم / توزيع</option><option value="damage">تالف</option><option value="supplier_return">إرجاع للمورد</option></select></label>}
            <button className="primary-button" disabled={saving || products.length === 0}>{saving ? 'كيتم التسجيل...' : 'تسجيل حركة المخزون'}</button>
          </form>
          <p className="hint">أي إخراج بكمية أكبر من المخزون المتوفر غادي يترفض. كل حركة كتتسجل مع تحديث الرصيد داخل نفس المعاملة.</p>
        </section>
        <section className="panel customer-panel"><div className="panel-heading"><div><h3>الزبناء والديون</h3><p>الدين محسوب مباشرة من الفواتير المؤكدة</p></div><span className="step-mark">04</span></div>
          <form onSubmit={submitCustomer}>
            <label>اسم الزبون<input required value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="اسم المحل أو الزبون" /></label>
            <div className="two-cols"><label>الهاتف<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="اختياري" /></label><label>المدينة<input value={customerCity} onChange={e => setCustomerCity(e.target.value)} placeholder="مثلاً برشيد" /></label></div>
            <button className="primary-button" disabled={saving}>{saving ? 'كيتم الحفظ...' : 'إضافة الزبون'}</button>
          </form>
          <div className="customer-list">{customers.length === 0 ? <p className="hint">مازال ما تسجل حتى زبون.</p> : customers.map(customer => <article className="customer-row" key={customer.id}><div><strong>{customer.name}</strong><span>{customer.phone || customer.city || 'بدون معلومات إضافية'}</span></div><div><strong>{formatMad(customer.debt_minor)}</strong><span>الدين · {customer.invoice_count} فاتورة</span></div></article>)}</div>
        </section>
        <section className="panel movement-panel"><div className="panel-heading"><div><h3>سجل حركة المخزون</h3><p>آخر الحركات المسجلة بالتاريخ والوجهة</p></div><span className="step-mark">11</span></div>
          {movementHistory.length===0 ? <p className="hint">مازال ما تسجلات حتى حركة.</p> : <div className="movement-list">{movementHistory.map(movement=><article className="movement-row" key={movement.id}>
            <div><strong>{movement.product_name}</strong><span>{movement.movement_type==='purchase_receipt'?'توريد':movement.movement_type==='sale'?'بيع':movement.movement_type==='delivery'?'توزيع':movement.movement_type==='damage'?'تالف':movement.movement_type==='supplier_return'?'إرجاع للمورد':movement.movement_type==='stock_count'?'جرد':'حركة مخزون'} · {new Date(movement.occurred_at).toLocaleString('ar-MA')}</span><small>{movement.from_label ? 'من '+movement.from_label : ''}{movement.to_label ? ' ← '+movement.to_label : ''}{movement.note ? ' · '+movement.note : ''}</small></div>
            <strong>{movement.quantity}</strong>
          </article>)}</div>}
        </section>
        <section className="panel finance-panel"><div className="panel-heading"><div><h3>ملخص الحسابات</h3><p>إجمالي الفواتير المؤكدة منذ بداية الاستخدام</p></div><span className="step-mark">09</span></div>
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
        <section className="panel expense-panel"><div className="panel-heading"><div><h3>مصاريف التشغيل</h3><p>سجل النقل والوقود والكراء والمصاريف الأخرى</p></div><span className="step-mark">10</span></div>
          <form onSubmit={submitExpense}>
            <label>تصنيف المصروف<select value={expenseCategory} onChange={e => setExpenseCategory(e.target.value)}><option>نقل</option><option>وقود</option><option>كراء</option><option>أجور</option><option>صيانة</option><option>اتصالات</option><option>مصاريف أخرى</option></select></label>
            <label>المبلغ (DH)<input type="number" min="0.01" step="0.01" required value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} placeholder="0.00" /></label>
            <label>ملاحظة<input value={expenseNote} onChange={e => setExpenseNote(e.target.value)} placeholder="اختياري" /></label>
            <button className="primary-button" disabled={saving}>{saving ? 'كيتسجل المصروف...' : 'حفظ المصروف'}</button>
          </form>
        </section>
        <section className="panel alerts-panel"><div className="panel-heading"><div><h3>تنبيهات المخزون والصلاحية</h3><p>مراقبة النقص والدفعات اللي قربات تسالي</p></div><span className="step-mark">08</span></div>
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
        <section className="panel supplier-panel"><div className="panel-heading"><div><h3>الموردون والتوريدات</h3><p>إضافة مورد وتسجيل وصولات الشراء مع الصلاحية</p></div><span className="step-mark">07</span></div>
          <form onSubmit={submitSupplier}>
            <label>اسم المورد<input required value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="اسم الشركة أو الموزع" /></label>
            <label>الهاتف<input value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} placeholder="اختياري" /></label>
            <button className="secondary-button" disabled={saving}>{saving ? 'كيتم الحفظ...' : 'إضافة المورد'}</button>
          </form>
          <div className="supplier-list">{suppliers.map(supplier => <article className="customer-row" key={supplier.id}><div><strong>{supplier.name}</strong><span>{supplier.phone || 'بدون هاتف'}</span></div><div><strong>{formatMad(supplier.purchased_minor)}</strong><span>{supplier.receipt_count} وصل شراء</span></div></article>)}</div>
          <div className="section-divider"></div>
          <form onSubmit={submitPurchase}>
            <label>المورد<select required value={purchaseSupplierId} onChange={e => setPurchaseSupplierId(e.target.value)}><option value="">اختار المورد</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            {purchaseLines.map((line,index)=><div className="purchase-line" key={index}>
              <label>المنتج<select required value={line.productId} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,productId:e.target.value}:item))}><option value="">اختار المنتج</option>{products.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
              <div className="two-cols"><label>الكمية<input type="number" min="0.01" step="0.01" required value={line.quantity} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))} /></label><label>تكلفة الوحدة (DH)<input type="number" min="0" step="0.01" required value={line.unitCost} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,unitCost:e.target.value}:item))} /></label></div>
              <div className="two-cols"><label>رقم الدفعة<input value={line.batchCode} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,batchCode:e.target.value}:item))} placeholder="اختياري" /></label><label>تاريخ الصلاحية<input type="date" value={line.expiryDate} onChange={e=>setPurchaseLines(current=>current.map((item,i)=>i===index?{...item,expiryDate:e.target.value}:item))} /></label></div>
              <button type="button" className="remove-line" disabled={purchaseLines.length===1} onClick={()=>setPurchaseLines(current=>current.filter((_,i)=>i!==index))}>حذف السطر</button>
            </div>)}
            <button type="button" className="secondary-button" onClick={()=>setPurchaseLines(current=>[...current,{productId:'',quantity:'1',unitCost:'',batchCode:'',expiryDate:''}])}>+ إضافة منتج لوصل الشراء</button>
            <button className="primary-button" disabled={saving || suppliers.length === 0 || products.length === 0 || purchaseLines.length===0}>{saving ? 'كيتسجل التوريد...' : 'تأكيد التوريد وإضافة المخزون'}</button>
          </form>
          <p className="hint">التوريد كيزيد المخزون ويحدث متوسط تكلفة الشراء. وصل الشراء والدفعات وحركة المخزون كيتسجلو فمعاملة واحدة.</p>
        </section>
        <section className="panel collection-panel"><div className="panel-heading"><div><h3>تحصيل الديون</h3><p>تسجيل أداء لاحق على فاتورة سابقة</p></div><span className="step-mark">06</span></div>
          <form onSubmit={submitCollection}>
            <label>الفاتورة المستحقة<select required value={collectionInvoiceId} onChange={e => setCollectionInvoiceId(e.target.value)}><option value="">اختار الفاتورة</option>{outstandingInvoices.map(invoice => <option key={invoice.invoiceId} value={invoice.invoiceId}>{invoice.invoiceNumber} · {invoice.customerName} · باقي {formatMad(invoice.dueMinor)}</option>)}</select></label>
            <label>المبلغ المستخلص (DH)<input type="number" min="0.01" step="0.01" required value={collectionAmount} onChange={e => setCollectionAmount(e.target.value)} placeholder="0.00" /></label>
            <button className="primary-button" disabled={saving || outstandingInvoices.length === 0}>{saving ? 'كيتسجل الأداء...' : 'تأكيد تحصيل الدين'}</button>
          </form>
          {outstandingInvoices.length === 0 ? <p className="hint">ما كايناش فواتير جديدة فيها دين مستحق.</p> : <p className="hint">الفواتير القديمة غير المؤكدة ما كتدخلش فهاد اللائحة. ما يمكنش تحصيل مبلغ أكبر من الدين المتبقي.</p>}
        </section>
        <section className="panel sales-panel"><div className="panel-heading"><div><h3>فاتورة بيع جديدة</h3><p>فاتورة متعددة المنتجات مع تخفيض وأداء جزئي</p></div><span className="step-mark">05</span></div>
          <form onSubmit={submitSale}>
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
          <p className="hint">الفاتورة كتجمع عدة منتجات، وكتتسجل تفاصيل الثمن والتكلفة وكتنقص الكميات من المستودع. البيع كيرفض إلا ما كانش المخزون كافي.</p>
        </section>
      </div>}
      <footer>تطبيقي · بيانات التطوير محلية على الجهاز · لا تستعملها للمحاسبة الفعلية بعد</footer>
    </main>
  );
}
