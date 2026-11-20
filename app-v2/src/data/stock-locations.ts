import type { SqliteExecutor } from './sqlite-database';

export type StockLocationKind='depot'|'vehicle';
export interface CreateStockLocationInput {
 id:string; label:string; kind:StockLocationKind; vehicleCode?:string; vehicleType?:'van_sales'|'delivery'; createdBy:string;
}
export interface CreatedStockLocation {id:string;label:string;kind:StockLocationKind;vehicleId:string|null;}
const required=(value:string,label:string)=>{const clean=value.trim();if(!clean)throw new Error(label+' مطلوب.');return clean;};

/** Creates a depot or a vehicle and its stock location atomically. */
export class StockLocationRepository {
 constructor(private readonly db:SqliteExecutor,private readonly now:()=>string=()=>new Date().toISOString()){}
 async create(input:CreateStockLocationInput):Promise<CreatedStockLocation>{
  const id=required(input.id,'معرّف الموقع'),label=required(input.label,'اسم الموقع'),actor=required(input.createdBy,'المستخدم');
  if(!['depot','vehicle'].includes(input.kind))throw new Error('نوع الموقع غير صالح.');
  const vehicleId=input.kind==='vehicle'?id+':vehicle':null;
  const code=input.kind==='vehicle'?required(input.vehicleCode??'','رمز السيارة'):null;
  const vehicleType=input.vehicleType??'van_sales';
  if(input.kind==='vehicle'&&!['van_sales','delivery'].includes(vehicleType))throw new Error('نوع السيارة غير صالح.');
  const timestamp=this.now();
  await this.db.beginTransaction();
  try{
   if(vehicleId)await this.db.run(
    'INSERT INTO vehicles (id,code,label,vehicle_type,assigned_user_id,is_active,created_at,updated_at) VALUES (?,?,?,?,NULL,1,?,?)',
    [vehicleId,code,label,vehicleType,timestamp,timestamp]);
   await this.db.run(
    'INSERT INTO stock_locations (id,location_type,vehicle_id,label,is_active) VALUES (?,?,?,?,1)',
    [id,input.kind,vehicleId,label]);
   await this.db.run(
    'INSERT INTO audit_events (id,actor_user_id,action,entity_type,entity_id,after_json,occurred_at) VALUES (?,?,?,?,?,?,?)',
    [id+':audit',actor,'stock_location.created','stock_location',id,JSON.stringify({label,kind:input.kind,vehicleId}),timestamp]);
   await this.db.commitTransaction();
   return{id,label,kind:input.kind,vehicleId};
  }catch(error){await this.db.rollbackTransaction().catch(()=>undefined);throw error;}
 }
}
