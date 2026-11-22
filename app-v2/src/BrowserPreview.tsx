import {useState,type ReactNode} from 'react';
import './browser-preview.css';

type Section='home'|'sales'|'inventory'|'distribution'|'purchases'|'relations'|'management';
const nav:Array<{id:Section;label:string;icon:string}>= [
  {id:'home',label:'الرئيسية',icon:'⌂'},
  {id:'sales',label:'المبيعات',icon:'▣'},
  {id:'inventory',label:'المخزون',icon:'▤'},
  {id:'distribution',label:'التوزيع',icon:'⇢'},
  {id:'purchases',label:'المشتريات',icon:'⇩'},
  {id:'relations',label:'العلاقات',icon:'♧'},
  {id:'management',label:'الإدارة',icon:'⚙'}
];
const products=[
  {name:'ماء معدني 1.5L',category:'مشروبات',price:'4.50 DH',stock:'240',emoji:'💧',tone:'blue'},
  {name:'زيت المائدة 1L',category:'مواد غذائية',price:'18.00 DH',stock:'86',emoji:'🫒',tone:'gold'},
  {name:'حليب UHT',category:'مواد غذائية',price:'9.50 DH',stock:'120',emoji:'🥛',tone:'cream'},
  {name:'منظف متعدد الاستعمال',category:'تنظيف',price:'22.00 DH',stock:'18',emoji:'🧴',tone:'green'}
];
function ScreenCard({title,subtitle,children,tag}:{title:string;subtitle?:string;children:ReactNode;tag?:string}){
 return <article className="pv-screen"><header className="pv-screen-head"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>{tag&&<span>{tag}</span>}</header>{children}</article>;
}
export default function BrowserPreview(){
 const [active,setActive]=useState<Section>('home');
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState('اليوم');
 const filtered=products.filter(p=>(p.name+' '+p.category).includes(query));
 return <main className="pv-app" dir="rtl">
  <header className="pv-top"><div className="pv-brand"><span className="pv-logo">ت</span><div><b>تطبيقي</b><small>إدارة التوزيع والمبيعات</small></div></div><div className="pv-user"><span>المالك</span><b>م</b></div></header>
  <div className="pv-body">
   <div className="pv-heading"><div><small>الأحد، 22 نونبر 2026</small><h1>{nav.find(n=>n.id===active)?.label}</h1><p>تسيير واضح وسريع، كل مهمة فشاشتها.</p></div><span className="pv-status">● متصل</span></div>
   {active==='home'&&<div className="pv-dashboard">
    <section className="pv-hero"><div><small>نظرة عامة على النشاط</small><h2>مرحبا بك 👋</h2><p>ها ملخص الشركة ديالك اليوم.</p></div><span>22 NOV</span></section>
    <div className="pv-kpis"><article><small>مبيعات اليوم</small><b>8,450 <i>DH</i></b><em>↑ 12.5%</em></article><article><small>صافي الربح</small><b>1,860 <i>DH</i></b><em>اليوم</em></article><article><small>ديون الزبناء</small><b>12,300 <i>DH</i></b><em className="warn">تحتاج متابعة</em></article><article><small>منتجات نشيطة</small><b>248</b><em>12 منخفضة</em></article></div>
    <ScreenCard title="عمليات سريعة" subtitle="اختار المهمة مباشرة"><div className="pv-actions">{[['＋','بيع جديد','sales'],['▦','منتج جديد','inventory'],['⇩','توريد','purchases'],['♙','زبون جديد','relations']] .map(([icon,label,id])=><button key={id} onClick={()=>setActive(id as Section)}><b>{icon}</b><span>{label}</span></button>)}</div></ScreenCard>
    <ScreenCard title="آخر النشاطات" subtitle="ملخص آخر العمليات"><div className="pv-list"><div><b>فاتورة #FV-1048</b><small>متجر الأمل · منذ 12 دقيقة</small><strong>1,250 DH</strong></div><div><b>توريد #ACH-028</b><small>شركة التوزيع · منذ ساعة</small><strong>+ 60 وحدة</strong></div><div><b>تحصيل دين</b><small>بقالة النور · منذ ساعتين</small><strong>500 DH</strong></div></div></ScreenCard>
   </div>}
   {active==='sales'&&<div className="pv-pages"><ScreenCard title="نقطة البيع" subtitle="اختار المنتجات وزيدها للسلة" tag="بيع جديد"><input className="pv-search" placeholder="قلب على منتج أو مسح الباركود..." value={query} onChange={e=>setQuery(e.target.value)}/><div className="pv-products">{filtered.map(p=><button key={p.name} className="pv-product"><span className={'pv-product-img '+p.tone}>{p.emoji}</span><b>{p.name}</b><small>{p.category}</small><strong>{p.price}</strong></button>)}</div><div className="pv-total"><span>مجموع السلة · 2 منتجات</span><b>27.00 DH</b></div><button className="pv-primary">متابعة وإصدار الفاتورة</button></ScreenCard><ScreenCard title="الفواتير" subtitle="آخر الفواتير المسجلة"><div className="pv-list"><div><b>#FV-1048</b><small>متجر الأمل · نقداً</small><strong>1,250 DH</strong></div><div><b>#FV-1047</b><small>بقالة النور · جزئي</small><strong>860 DH</strong></div><div><b>#FV-1046</b><small>متجر السلام · دين</small><strong>2,100 DH</strong></div></div></ScreenCard><ScreenCard title="تحصيل الديون" subtitle="المبالغ المتبقية على الفواتير"><div className="pv-stat-row"><b>12,300 DH</b><small>إجمالي المستحقات</small></div><button className="pv-primary">تسجيل تحصيل</button></ScreenCard></div>}
   {active==='inventory'&&<div className="pv-pages"><ScreenCard title="كتالوج المنتجات" subtitle="الصور أولاً لتسهيل الاختيار" tag="248 منتج"><input className="pv-search" placeholder="بحث بالاسم أو الباركود..." value={query} onChange={e=>setQuery(e.target.value)}/><div className="pv-products">{filtered.map(p=><button key={p.name} className="pv-product"><span className={'pv-product-img '+p.tone}>{p.emoji}</span><b>{p.name}</b><small>{p.category}</small><strong>{p.stock} متوفر</strong></button>)}</div></ScreenCard><ScreenCard title="حركة المخزون" subtitle="إدخال، إخراج، وتحويل"><div className="pv-actions"><button><b>＋</b><span>إدخال مخزون</span></button><button><b>⇢</b><span>تحويل سيارة</span></button><button><b>▤</b><span>جرد المخزون</span></button><button><b>↩</b><span>مرتجعات</span></button></div></ScreenCard><ScreenCard title="التنبيهات" subtitle="منتجات تحتاج متابعة"><div className="pv-list"><div><b>زيت المائدة 1L</b><small>المخزون أقل من الحد الأدنى</small><strong className="pv-red">8 متبقي</strong></div><div><b>منظف متعدد الاستعمال</b><small>قرب ينفد</small><strong className="pv-red">4 متبقي</strong></div></div></ScreenCard></div>}
   {active==='distribution'&&<div className="pv-pages"><ScreenCard title="طلبات المحلات" subtitle="تتبع الطلبات حسب المرحلة"><div className="pv-filters">{['الكل','جديد','قيد التحضير','جاهز'].map(x=><button className={selected===x?'on':''} onClick={()=>setSelected(x)} key={x}>{x}</button>)}</div><div className="pv-list"><div><b>CMD-104 · متجر الأمل</b><small>6 منتجات · سيارة التوصيل 02</small><strong className="pv-green">قيد التحضير</strong></div><div><b>CMD-103 · بقالة النور</b><small>4 منتجات · سيارة التوصيل 01</small><strong>جاهز</strong></div><div><b>CMD-102 · متجر السلام</b><small>8 منتجات · لم تعين السيارة</small><strong>جديد</strong></div></div></ScreenCard><ScreenCard title="مسارات التوصيل" subtitle="توزيع الطلبات على السيارات"><div className="pv-route"><span>🚚</span><div><b>السيارة 01</b><small>السائق: ياسين · 5 طلبات</small></div><strong>عرض المسار</strong></div><div className="pv-route"><span>🚚</span><div><b>السيارة 02</b><small>السائق: أمين · 3 طلبات</small></div><strong>عرض المسار</strong></div></ScreenCard></div>}
   {active==='purchases'&&<div className="pv-pages"><ScreenCard title="تسجيل توريد" subtitle="إضافة بضاعة للمخزون"><label className="pv-label">المورد<select><option>اختار المورد</option><option>شركة الأطلس</option></select></label><label className="pv-label">المرجع<input placeholder="رقم وصل الشراء"/></label><div className="pv-stat-row"><b>3 منتجات</b><small>مجموع التوريد: 4,850 DH</small></div><button className="pv-primary">حفظ التوريد</button></ScreenCard><ScreenCard title="الموردون" subtitle="متابعة الأرصدة والتوريدات"><div className="pv-list"><div><b>شركة الأطلس</b><small>آخر توريد · 18 نونبر</small><strong>2,400 DH</strong></div><div><b>موزع الشمال</b><small>آخر توريد · 16 نونبر</small><strong>850 DH</strong></div></div></ScreenCard></div>}
   {active==='relations'&&<div className="pv-pages"><ScreenCard title="الزبناء" subtitle="بطاقات مختصرة ومعلومات أساسية"><input className="pv-search" placeholder="قلب على زبون..."/><div className="pv-list"><div><b>متجر الأمل</b><small>الدار البيضاء · 06 12 34 56 78</small><strong>1,250 DH</strong></div><div><b>بقالة النور</b><small>المحمدية · 06 98 76 54 32</small><strong>3,400 DH</strong></div><div><b>متجر السلام</b><small>سطات · 06 11 22 33 44</small><strong>0 DH</strong></div></div></ScreenCard><ScreenCard title="الديون والتحصيل" subtitle="راقب المستحقات"><div className="pv-stat-row"><b>12,300 DH</b><small>إجمالي ديون الزبناء</small></div><button className="pv-primary">تسجيل أداء جديد</button></ScreenCard></div>}
   {active==='management'&&<div className="pv-pages"><ScreenCard title="التقارير المالية" subtitle="أرقام مركزة بدون ازدحام"><div className="pv-kpis pv-report"><article><small>المبيعات</small><b>84,500 <i>DH</i></b></article><article><small>تكلفة البضاعة</small><b>62,100 <i>DH</i></b></article><article><small>الربح الإجمالي</small><b>22,400 <i>DH</i></b></article><article><small>المصاريف</small><b>4,200 <i>DH</i></b></article></div></ScreenCard><ScreenCard title="الفريق والسيارات" subtitle="إدارة المستخدمين والتعيينات"><div className="pv-list"><div><b>ياسين</b><small>مندوب بيع · السيارة 01</small><strong className="pv-green">نشط</strong></div><div><b>أمين</b><small>سائق توصيل · السيارة 02</small><strong className="pv-green">نشط</strong></div></div><button className="pv-primary">إدارة الفريق</button></ScreenCard></div>}
   <p className="pv-hint">اسحب أفقياً للتنقل بين شاشات هذا القسم ←</p>
  </div>
  <nav className="pv-nav">{nav.map(item=><button key={item.id} className={active===item.id?'active':''} onClick={()=>{setActive(item.id);setQuery('')}}><b>{item.icon}</b><span>{item.label}</span></button>)}</nav>
 </main>;
}
