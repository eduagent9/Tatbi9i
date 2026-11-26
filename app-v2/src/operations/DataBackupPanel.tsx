import { useState, type ChangeEvent } from 'react';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { APP_DATABASE_NAME, closeAppDatabase, openAppDatabase, type SqliteExecutor } from '../data/sqlite-database';
import { decryptBackupText, encryptBackupText, isEncryptedBackupText } from './backup-crypto';
import { parseSqliteBackupPayload, parseTatbiqiBackup, withOverwrite } from './backup-format';

type ExportingDatabase = SqliteExecutor & { exportToJson(mode: string): Promise<unknown> };

const sqlite = new SQLiteConnection(CapacitorSQLite);
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

async function exportPayload(db: SqliteExecutor) {
  const result = await (db as ExportingDatabase).exportToJson('full');
  const wrapper = result as { export?: unknown };
  return parseSqliteBackupPayload(wrapper?.export ?? result, APP_DATABASE_NAME);
}

export function DataBackupPanel() {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [backupPassword,setBackupPassword]=useState('');
  const [backupPasswordConfirm,setBackupPasswordConfirm]=useState('');
  const [restorePassword,setRestorePassword]=useState('');

  async function exportBackup() {
    setBusy(true);setMessage('');setError('');
    try {
      if(backupPassword.length<12)throw new Error('كلمة سر النسخة خاصها تكون 12 حرف أو أكثر.');
      if(backupPassword!==backupPasswordConfirm)throw new Error('تأكيد كلمة السر ما مطابقش.');
      const db=await openAppDatabase();
      const payload=await exportPayload(db);
      const backup={
        format:'tatbiqi-sqlite-backup',
        formatVersion:1,
        appDatabase:APP_DATABASE_NAME,
        exportedAt:new Date().toISOString(),
        payload,
      };
      const encryptedText=await encryptBackupText(JSON.stringify(backup),backupPassword);
      const blob=new Blob([encryptedText],{type:'application/json'});
      if(blob.size>MAX_BACKUP_BYTES)throw new Error('حجم النسخة المشفرة تجاوز 64 MB؛ خاصنا نقسمو ملفات المرفقات قبل التصدير.');
      const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      const file=new File([blob],`tatbiqi-backup-${stamp}.tatbiqi`,{type:'application/json'});
      if(typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:'نسخة احتياطية مشفرة من تطبيقي',text:'النسخة محمية بكلمة السر اللي اخترتي. احتفظ بكلمة السر بشكل منفصل.'});
        setMessage('تم إنشاء النسخة المشفرة ومشاركتها. كلمة السر ما كتتحفظش داخل الملف؛ احتافظ بها بشكل منفصل.');
      }else{
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');
        link.href=url;link.download=file.name;link.style.display='none';
        document.body.appendChild(link);link.click();link.remove();
        window.setTimeout(()=>URL.revokeObjectURL(url),1000);
        setMessage('تم تنزيل النسخة المشفرة. تأكد من وجود الملف، واحتافظ بكلمة السر بشكل منفصل.');
      }
      setBackupPassword('');setBackupPasswordConfirm('');
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
    if(file.size>MAX_BACKUP_BYTES){setError('حجم ملف النسخة كبير بزاف؛ الحد الأقصى هو 64 MB.');return;}

    let importJson:string;
    try{
      const fileText=await file.text();
      let backupText=fileText;
      if(isEncryptedBackupText(fileText)){
        if(restorePassword.length<12)throw new Error('دخل كلمة سر النسخة (12 حرف أو أكثر).');
        backupText=await decryptBackupText(fileText,restorePassword);
      }else{
        const acceptLegacy=window.confirm('هاد النسخة قديمة وغير مشفرة. الملف يقدر يكشف بيانات الزبناء والفواتير. واش متأكد بغيتي تسترجعو؟');
        if(!acceptLegacy)throw new Error('تلغى الاسترجاع ديال النسخة القديمة غير المشفرة.');
      }
      const payload=parseTatbiqiBackup(backupText,APP_DATABASE_NAME);
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

      setRestorePassword('');
      window.alert('تم استرجاع النسخة الاحتياطية بنجاح. غادي نعاودو فتح التطبيق باش نقراو البيانات الجديدة.');
      window.location.reload();
    }catch(reason){
      setError(reason instanceof Error?reason.message:'تعذر استرجاع النسخة الاحتياطية.');
    }finally{setBusy(false);}
  }

  return <section data-section="management" className="panel backup-panel">
    <div className="panel-heading"><div><h3>حماية البيانات والنسخ الاحتياطي</h3><p>قاعدة بيانات مشفرة ونسخة خارجية محمية بكلمة سر</p></div><span className="step-mark">13</span></div>
    <p className="hint">قاعدة البيانات داخل Android كتستعمل SQLCipher. ملف النسخة كيتشفر بـ AES-256-GCM، وكلمة السر كتشتق منها بمفتاح PBKDF2؛ ما كتتحفظش داخل الملف. اختار كلمة سر قوية واحتافظ بها بشكل منفصل.</p>
    {message&&<p className="hint" role="status">{message}</p>}
    {error&&<p className="hint" role="alert">{error}</p>}
    <label>كلمة سر النسخة (12 حرف على الأقل)<input type="password" autoComplete="new-password" value={backupPassword} onChange={event=>setBackupPassword(event.target.value)} disabled={busy} /></label>
    <label>تأكيد كلمة السر<input type="password" autoComplete="new-password" value={backupPasswordConfirm} onChange={event=>setBackupPasswordConfirm(event.target.value)} disabled={busy} /></label>
    <button className="primary-button" type="button" disabled={busy||backupPassword.length<12||backupPassword!==backupPasswordConfirm} onClick={exportBackup}>{busy?'كيتم إنشاء النسخة...':'إنشاء نسخة احتياطية مشفرة'}</button>
    <div className="section-divider"></div>
    <label>كلمة سر النسخة المراد استرجاعها<input type="password" autoComplete="current-password" value={restorePassword} onChange={event=>setRestorePassword(event.target.value)} disabled={busy} /></label>
    <label>استرجاع نسخة احتياطية من الهاتف<input type="file" accept=".tatbiqi,.json,application/json" disabled={busy} onChange={restoreBackup}/></label>
    <p className="hint">الاسترجاع كيعوض البيانات الحالية. قبل العملية كيتحقق التطبيق من الملف وكيحتافظ مؤقتاً بنسخة أمان من قاعدة البيانات الحالية. النسخ القديمة غير المشفرة كتحتاج تأكيداً صريحاً. ملاحظة: ملفات الصور والتوقيعات المخزنة خارج قاعدة البيانات خاصها اختبار مستقل قبل اعتماد نقل النسخة بين الأجهزة.</p>
  </section>;
}
