import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatMad, madToMinorUnits } from './data/money';
import { openAppDatabase } from './data/sqlite-database';
import { ProductRepository, type ProductRecord } from './data/products';
import { StockRepository } from './data/stock';

const emptyForm = { name: '', category: 'مواد غذائية', subcategory: '', unit: 'piece' as 'piece' | 'carton', pieces: '12', cost: '', price: '', threshold: '0', barcode: '' };

export default function App() {
  const [repository, setRepository] = useState<ProductRepository | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [stockProductId, setStockProductId] = useState('');
  const [stockQuantity, setStockQuantity] = useState('1');
  const [stockDirection, setStockDirection] = useState<'in' | 'out'>('in');

  const refresh = useCallback(async (repo: ProductRepository) => setProducts(await repo.list()), []);
  useEffect(() => {
    let alive = true;
    openAppDatabase().then(async db => {
      if (!alive) return;
      const repo = new ProductRepository(db);
      setRepository(repo);
      await refresh(repo);
    }).catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : 'تعذر فتح قاعدة البيانات.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refresh]);

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
        quantity, movementType: stockDirection === 'in' ? 'purchase_receipt' : 'damage',
        note: stockDirection === 'in' ? 'إدخال للمستودع' : 'إخراج من المستودع',
      });
      await refresh(repository); setStockQuantity('1'); setNotice('تسجلات حركة المخزون بنجاح.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'تعذر تسجيل الحركة.'); }
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
        <section className="panel stock-panel"><div className="panel-heading"><div><h3>حركة المخزون</h3><p>إدخال أو إخراج الكمية من المستودع الرئيسي</p></div><span className="step-mark">03</span></div>
          <form onSubmit={submitStock}>
            <label>المنتج<select required value={stockProductId} onChange={e => setStockProductId(e.target.value)}><option value="">اختار المنتج</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <div className="two-cols"><label>نوع الحركة<select value={stockDirection} onChange={e => setStockDirection(e.target.value as 'in'|'out')}><option value="in">إدخال للمستودع</option><option value="out">إخراج من المستودع</option></select></label><label>الكمية<input type="number" min="0.01" step="0.01" required value={stockQuantity} onChange={e => setStockQuantity(e.target.value)} /></label></div>
            <button className="primary-button" disabled={saving || products.length === 0}>{saving ? 'كيتم التسجيل...' : 'تسجيل حركة المخزون'}</button>
          </form>
          <p className="hint">أي إخراج بكمية أكبر من المخزون المتوفر غادي يترفض. كل حركة كتتسجل مع تحديث الرصيد داخل نفس المعاملة.</p>
        </section>
      </div>}
      <footer>تطبيقي · بيانات التطوير محلية على الجهاز · لا تستعملها للمحاسبة الفعلية بعد</footer>
    </main>
  );
}
