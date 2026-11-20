export default function App() {
  return (
    <main className="app-shell">
      <section className="welcome-card" aria-labelledby="app-title">
        <div className="brand-mark" aria-hidden="true">ت</div>
        <p className="eyebrow">نظام إدارة التوزيع والمبيعات</p>
        <h1 id="app-title">تطبيقي</h1>
        <p className="intro">
          الأساس التقني الجديد قيد التجهيز. النسخة الحالية وبياناتها محفوظة دون تغيير.
        </p>
        <div className="status-row">
          <span className="status-dot" />
          <span>مرحلة تأسيس البنية التقنية</span>
        </div>
      </section>
      <footer>نسخة التطوير الداخلية · لا تستخدم لإدارة المبيعات الفعلية بعد</footer>
    </main>
  );
}
