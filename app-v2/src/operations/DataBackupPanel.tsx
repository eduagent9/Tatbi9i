import { useState } from 'react';
import { APP_DATABASE_NAME, openAppDatabase, type SqliteExecutor } from '../data/sqlite-database';

type ExportingDatabase = SqliteExecutor & { exportToJson(mode: string): Promise<unknown> };

export function DataBackupPanel() {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  async function exportBackup() {
    setBusy(true);setMessage('');setError('');
    try {
      const db=await openAppDatabase();
      const result=await (db as ExportingDatabase).exportToJson('full');
      const wrapper=result as {export?:unknown};
      let payload=wrapper?.export??result;
      if(typeof payload==='string')payload=JSON.parse(payload);
      if(!payload||typeof payload!=='object'||(payload as {database?:string}).database!==APP_DATABASE_NAME)
        throw new Error('صيغة النسخة الاحتياطية اللي خرجات غير متوقعة؛ ما حفظنا حتى ملف.');
      const backup={
        format:'tatbiqi-sqlite-backup',
        formatVersion:1,
        appDatabase:APP_DATABASE_NAME,
        exportedAt:new Date().toISOString(),
        payload,
      };
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      const file=new File([blob],`tatbiqi-backup-${stamp}.json`,{type:'application/json'});
      if(typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:'نسخة احتياطية من تطبيقي',text:'احتفظ بهذا الملف لاسترجاع بيانات تطبيق تطبيقي.'});
        setMessage('تم تجهيز النسخة الاحتياطية ومشاركتها. احتفظ بالملف في مكان آمن.');
      }else{
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');
        link.href=url;link.download=file.name;link.style.display='none';
        document.body.appendChild(link);link.click();link.remove();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
        setMessage('تم تنزيل ملف النسخة الاحتياطية. تأكد من وجوده في التنزيلات قبل إغلاق التطبيق.');
      }
    }catch(reason){
      if(reason instanceof Error&&reason.name==='AbortError')setMessage('تلغات المشاركة؛ ما تبدل حتى شيء فقاعدة البيانات.');
      else setError(reason instanceof Error?reason.message:'تعذر إنشاء النسخة الاحتياطية.');
    }finally{setBusy(false);}
  }

  return <section className="panel backup-panel">
    <div className="panel-heading"><div><h3>حماية البيانات والنسخ الاحتياطي</h3><p>نسخة محلية من قاعدة بيانات التطبيق كاملة</p></div><span className="step-mark">13</span></div>
    <p className="hint">النسخة كتضم المنتجات والزبناء والفواتير والأداءات والتوريدات والمخزون والحركات. الملف كيتحفظ عندك، وما كيتصيفط حتى لخادم خارجي.</p>
    {message&&<p className="hint" role="status">{message}</p>}
    {error&&<p className="hint" role="alert">{error}</p>}
    <button className="primary-button" type="button" disabled={busy} onClick={exportBackup}>{busy?'كيتم إنشاء النسخة...':'إنشاء نسخة احتياطية وتنزيلها'}</button>
    <p className="hint">الاسترجاع من ملف احتياطي غادي يتزاد من بعد مع فحص الملف وتأكيد صريح قبل تعويض البيانات الحالية. ما تستعملش الملف كبديل عن نسخ احتياطية خارج الهاتف.</p>
  </section>;
}
