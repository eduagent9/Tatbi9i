import type { SqliteExecutor } from './sqlite-database';
export interface SupplierInput { id:string; name:string; phone?:string|null; address?:string|null; }
export interface SupplierRecord { id:string; name:string; phone:string|null; address:string|null; created_at:string; updated_at:string; receipt_count:number; purchased_minor:number; }
function required(value:string,label:string):string { const clean=value.trim(); if(!clean) throw new Error(label+' مطلوب.'); return clean; }

/** Supplier directory and purchase totals derived from receipt history. */
export class SupplierRepository {
  constructor(private readonly db:SqliteExecutor,private readonly now:()=>string=()=>new Date().toISOString()) {}
  async create(input:SupplierInput):Promise<void> {
    const id=required(input.id,'معرّف المورد'),name=required(input.name,'اسم المورد'),timestamp=this.now();
    await this.db.run(
      'INSERT INTO suppliers (id,name,phone,address,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      [id,name,input.phone?.trim()||null,input.address?.trim()||null,timestamp,timestamp],
    );
  }
  async update(input:SupplierInput):Promise<void>{
    const id=required(input.id,'معرّف المورد'),name=required(input.name,'اسم المورد'),timestamp=this.now();
    await this.db.beginTransaction();
    try{
      const found=await this.db.query('SELECT id FROM suppliers WHERE id=?',[id]);
      if(!found.values?.length)throw new Error('المورد غير موجود.');
      await this.db.run('UPDATE suppliers SET name=?,phone=?,address=?,updated_at=? WHERE id=?',[name,input.phone?.trim()||null,input.address?.trim()||null,timestamp,id]);
      await this.db.run('INSERT INTO audit_events (id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?)',[crypto.randomUUID(),'supplier.updated','supplier',id,JSON.stringify({name,phone:input.phone??null,address:input.address??null}),timestamp]);
      await this.db.commitTransaction();
    }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
  }

  async list(search=''):Promise<SupplierRecord[]> {
    const term='%'+search.trim().replace(/[\\%_]/g,'\\$&')+'%';
    const result=await this.db.query(
      `SELECT s.id,s.name,s.phone,s.address,s.created_at,s.updated_at,
       COUNT(p.id) AS receipt_count,COALESCE(SUM(p.total_minor),0) AS purchased_minor
       FROM suppliers s LEFT JOIN purchase_receipts p ON p.supplier_id=s.id
       WHERE s.name LIKE ? ESCAPE '\\' OR COALESCE(s.phone,'') LIKE ? ESCAPE '\\'
       GROUP BY s.id ORDER BY s.name COLLATE NOCASE`,
      [term,term],
    );
    return (result.values??[]) as unknown as SupplierRecord[];
  }
}
