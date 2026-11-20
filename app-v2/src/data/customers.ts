import type { SqliteExecutor } from './sqlite-database';

export interface CustomerInput {
  id:string; name:string; phone?:string|null; city?:string|null; region?:string|null;
  address?:string|null; notes?:string|null;
}
export interface CustomerRecord {
  id:string; name:string; phone:string|null; city:string|null; region:string|null;
  address:string|null; notes:string|null; invoice_count:number; debt_minor:number;
}
function clean(value:string,label:string):string {
  const result=value.trim(); if(!result) throw new Error(label+' مطلوب.'); return result;
}

/** Customer directory with a debt total derived from invoices, not stored as a fragile counter. */
export class CustomerRepository {
  constructor(private readonly db:SqliteExecutor,private readonly now:()=>string=()=>new Date().toISOString()) {}

  async create(input:CustomerInput):Promise<void> {
    const id=clean(input.id,'معرّف الزبون'),name=clean(input.name,'اسم الزبون');
    const timestamp=this.now();
    await this.db.run(
      `INSERT INTO customers (id,name,phone,city,region,address,notes,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id,name,input.phone?.trim()||null,input.city?.trim()||null,input.region?.trim()||null,input.address?.trim()||null,input.notes?.trim()||null,timestamp,timestamp],
    );
  }

  async list(search=''):Promise<CustomerRecord[]> {
    const term='%'+search.trim().replace(/[\\%_]/g,'\\$&')+'%';
    const result=await this.db.query(
      `SELECT c.id,c.name,c.phone,c.city,c.region,c.address,c.notes,
       COUNT(i.id) AS invoice_count,
       COALESCE(SUM(CASE
         WHEN i.confirmed_at IS NOT NULL AND i.status NOT IN ('voided','returned')
           THEN MAX(0,i.total_minor-i.collected_minor)
         WHEN i.confirmed_at IS NULL AND i.status NOT IN ('voided','returned')
           THEN i.legacy_due_minor
         ELSE 0 END),0) AS debt_minor
       FROM customers c
       LEFT JOIN invoices i ON i.customer_id=c.id
       WHERE c.is_active=1 AND (c.name LIKE ? ESCAPE '\\' OR COALESCE(c.phone,'') LIKE ? ESCAPE '\\' OR COALESCE(c.city,'') LIKE ? ESCAPE '\\')
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`,
      [term,term,term],
    );
    return (result.values??[]) as unknown as CustomerRecord[];
  }
}
