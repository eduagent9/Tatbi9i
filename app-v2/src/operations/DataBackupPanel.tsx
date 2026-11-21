import { useState, type ChangeEvent } from 'react';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { APP_DATABASE_NAME, closeAppDatabase, openAppDatabase, type SqliteExecutor } from '../data/sqlite-database';
import { parseSqliteBackupPayload, parseTatbiqiBackup, withOverwrite } from './backup-format';

type ExportingDatabase = SqliteExecutor & { exportToJson(mode: string): Promise<unknown> };

const sqlite = new SQLiteConnection(CapacitorSQLite);

async function exportPayload(db: SqliteExecutor) {
  const result = await (db as ExportingDatabase).exportToJson('full');
  const wrapper = result as { export?: unknown };
  return parseSqliteBackupPayload(wrapper?.export ?? result, APP_DATABASE_NAME);
}

export function DataBackupPanel() {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  async function exportBackup() {
    setBusy(true);setMessage('');setError('');
    try {
      const db=await openAppDatabase();
      const payload=await exportPayload(db);
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

  async function restoreBackup(event:ChangeEvent<HTMLInputElement>) {
    const input=event.currentTarget;
    const file=input.files?.[0];
    input.value='';
    if(!file)return;
    setMessage('');setError('');
    if(file.size>25*1024*1024){setError('حجم ملف النسخة كبير بزاف؛ الحد الأقصى هو 25 MB.');return;}

    let importJson:string;
    try{
      const payload=parseTatbiqiBackup(await file.text(),APP_DATABASE_NAME);
      importJson=JSON.stringify(withOverwrite(payload));
      const validity=await sqlite.isJsonValid(importJson);
      if(!validity.result)throw new Error('ملف النسخة ما اجتازش فحص SQLite؛ ما تبدلات حتى بيانات.');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'تعذر قراءة ملف النسخة الاحتياطية.');
      return;
    }

    const confirmed=window.confirm('تحذير: الاسترجاع غادي يعوض جميع البيانات الحالية بالبيانات الموجودة فالنسخة المختارة. غادي نحتافظو مؤقتاً بنسخة أمان داخل العملية لمحاولة الرجوع إذا فشل الاسترجاع. واش متأكد؟');
    if(!confirmed){setMessage('تلغى الاسترجاع؛ البيانات الحالية بقات كما هي.');return;}

    setBusy(true);
    try{
      const db=await openAppDatabase();
      const safetyPayload=await exportPayload(db);
      const safetyJson=JSON.stringify(withOverwrite(safetyPayload));
      const safetyValidity=await sqlite.isJsonValid(safetyJson);
      if(!safetyValidity.result)throw new Error('تعذر التحقق من نسخة الأمان الحالية؛ وقفنا الاسترجاع لحماية البيانات.');

      await closeAppDatabase();
      try{
        await sqlite.importFromJson(importJson);
        await openAppDatabase();
      }catch(restoreError){
        await closeAppDatabase().catch(()=>undefined);
        try{
          await sqlite.importFromJson(safetyJson);
          await openAppDatabase();
        }catch(rollbackError){
          const detail=rollbackError instanceof Error?rollbackError.message:'خطأ غير معروف';
          throw new Error('فشل الاسترجاع، وحتى إرجاع نسخة الأمان ما نجحش. ما تستعملش التطبيق حتى نفحصو قاعدة البيانات. التفاصيل: '+detail);
        }
        const detail=restoreError instanceof Error?restoreError.message:'خطأ غير معروف';
        throw new Error('فشل استرجاع الملف؛ رجعنا البيانات اللي كانت فالجهاز قبل العملية. التفاصيل: '+detail);
      }

      window.alert('تم استرجاع النسخة الاحتياطية بنجاح. غادي نعاودو فتح التطبيق باش نقراو البيانات الجديدة.');
      window.location.reload();
    }catch(reason){
      setError(reason instanceof Error?reason.message:'تعذر استرجاع النسخة الاحتياطية.');
    }finally{setBusy(false);}
  }

  return <section data-section="management" className="panel backup-panel">
    <div className="panel-heading"><div><h3>حماية البيانات والنسخ الاحتياطي</h3><p>نسخة محلية من قاعدة بيانات التطبيق كاملة</p></div><span className="step-mark">13</span></div>
    <p className="hint">النسخة كتضم المنتجات والزبناء والفواتير والأداءات والتوريدات والمخزون والحركات. الملف كيتحفظ عندك، وما كيتصيفط حتى لخادم خارجي. النسخة بصيغة JSON غير مشفرة؛ خزنها فمكان آمن.</p>
    {message&&<p className="hint" role="status">{message}</p>}
    {error&&<p className="hint" role="alert">{error}</p>}
    <button className="primary-button" type="button" disabled={busy} onClick={exportBackup}>{busy?'كيتم إنشاء النسخة...':'إنشاء نسخة احتياطية وتنزيلها'}</button>
    <div className="section-divider"></div>
    <label>استرجاع نسخة احتياطية من الهاتف<input type="file" accept=".json,application/json" disabled={busy} onChange={restoreBackup}/></label>
    <p className="hint">الاسترجاع كيعوض البيانات الحالية. قبل العملية كيتحقق التطبيق من الملف وكيحتافظ مؤقتاً بنسخة من قاعدة البيانات الحالية داخل العملية؛ وإذا فشل الاسترجاع كيحاول يرجع النسخة السابقة تلقائياً. اختار غير ملف نسخة احتياطية صادر من تطبيق تطبيقي.</p>
  </section>;
}
