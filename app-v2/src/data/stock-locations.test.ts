import {describe,expect,it,vi} from 'vitest';
import type {SqliteExecutor} from './sqlite-database';
import {StockLocationRepository} from './stock-locations';
function dbMock(fail=false){
 const db:SqliteExecutor={execute:vi.fn(async()=>undefined),query:vi.fn(async()=>({values:[]})),
  run:vi.fn(async(sql:string)=>{if(fail&&sql.includes('INSERT INTO stock_locations'))throw new Error('location failed');}),
  beginTransaction:vi.fn(async()=>undefined),commitTransaction:vi.fn(async()=>undefined),rollbackTransaction:vi.fn(async()=>undefined)};
 return db;
}
describe('StockLocationRepository',()=>{
 it('creates a depot location atomically',async()=>{
  const db=dbMock();const result=await new StockLocationRepository(db,()=> '2026-11-20T12:00:00Z').create({id:'depot-2',label:'مخزن الفرع',kind:'depot',createdBy:'local-owner'});
  expect(result).toEqual({id:'depot-2',label:'مخزن الفرع',kind:'depot',vehicleId:null});
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_locations'),['depot-2','depot',null,'مخزن الفرع']);
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });
 it('creates a vehicle record and its linked stock location',async()=>{
  const db=dbMock();const result=await new StockLocationRepository(db).create({id:'loc-van-1',label:'سيارة التوزيع 1',kind:'vehicle',vehicleCode:'VAN-01',createdBy:'local-owner'});
  expect(result.vehicleId).toBe('loc-van-1:vehicle');
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO vehicles'),['loc-van-1:vehicle','VAN-01','سيارة التوزيع 1','van_sales','2026-11-20T00:00:00.000Z','2026-11-20T00:00:00.000Z']);
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });
 it('rolls back if location creation fails',async()=>{
  const db=dbMock(true);
  await expect(new StockLocationRepository(db).create({id:'loc-2',label:'فرع 2',kind:'depot',createdBy:'local-owner'})).rejects.toThrow('location failed');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();expect(db.commitTransaction).not.toHaveBeenCalled();
 });
 it('rejects a vehicle without a code before starting a transaction',async()=>{
  const db=dbMock();
  await expect(new StockLocationRepository(db).create({id:'loc-v',label:'سيارة',kind:'vehicle',createdBy:'local-owner'})).rejects.toThrow('رمز السيارة');
  expect(db.beginTransaction).not.toHaveBeenCalled();
 });
});
