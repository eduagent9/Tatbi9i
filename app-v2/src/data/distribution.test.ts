import {describe,expect,it,vi} from 'vitest';
import type {SqliteExecutor} from './sqlite-database';
import {DistributionRepository} from './distribution';

function makeDb(queryHandler:(sql:string,values?:unknown[])=>Array<Record<string,unknown>>){
 const db:SqliteExecutor={
  execute:vi.fn(async()=>undefined),
  query:vi.fn(async(sql:string,values?:unknown[])=>({values:queryHandler(sql,values)})),
  run:vi.fn(async()=>undefined),
  beginTransaction:vi.fn(async()=>undefined),
  commitTransaction:vi.fn(async()=>undefined),
  rollbackTransaction:vi.fn(async()=>undefined),
 };
 return db;
}
describe('DistributionRepository',()=>{
 it('creates an ordered route only for its assigned active delivery driver',async()=>{
  const db=makeDb(sql=>{
   if(sql.includes('FROM vehicles v'))return [{id:'v1',vehicle_type:'delivery',assigned_user_id:'d1',role:'delivery_driver',is_active:1}];
   if(sql.includes('FROM customers'))return [{id:'c1'}];
   return [];
  });
  const repo=new DistributionRepository(db,()=> '2026-11-21T10:00:00.000Z',()=> 'generated');
  await repo.createRoute({id:'r1',code:'R-1',name:'وسط المدينة',plannedDate:'2026-11-22',vehicleId:'v1',driverUserId:'d1',createdBy:'owner',stops:[
   {id:'s2',customerId:'c2',stopOrder:2},{id:'s1',customerId:'c1',stopOrder:1}
  ]});
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO delivery_routes'),expect.any(Array));
  const stops=(db.run as unknown as {mock:{calls:Array<[string,unknown[]]>}}).mock.calls.filter(call=>call[0].includes('INSERT INTO delivery_route_stops'));
  expect(stops.map(call=>call[1][2])).toEqual([1,2]);
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });
 it('rolls back route creation when the selected driver is not assigned to the vehicle',async()=>{
  const db=makeDb(sql=>sql.includes('FROM vehicles v')?[{id:'v1',vehicle_type:'delivery',assigned_user_id:'other',role:'delivery_driver',is_active:1}]:[]);
  const repo=new DistributionRepository(db);
  await expect(repo.createRoute({id:'r1',code:'R-1',name:'جولة',plannedDate:'2026-11-22',vehicleId:'v1',driverUserId:'d1',createdBy:'owner',stops:[{id:'s1',customerId:'c1',stopOrder:1}]})).rejects.toThrow('السائق خاصو');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  expect(db.commitTransaction).not.toHaveBeenCalled();
 });
 it('rejects duplicate customer stops before opening a transaction',async()=>{
  const db=makeDb(()=>[]);
  const repo=new DistributionRepository(db);
  await expect(repo.createRoute({id:'r1',code:'R-1',name:'جولة',plannedDate:'2026-11-22',vehicleId:'v1',driverUserId:'d1',createdBy:'owner',stops:[
   {id:'s1',customerId:'c1',stopOrder:1},{id:'s2',customerId:'c1',stopOrder:2}
  ]})).rejects.toThrow('ما تكررش');
  expect(db.beginTransaction).not.toHaveBeenCalled();
 });
 it('records supplier payments only within the supplier outstanding balance',async()=>{
  const db=makeDb(sql=>{
   if(sql.includes('SELECT id FROM suppliers'))return [{id:'s1'}];
   if(sql.includes('SELECT id,total_minor FROM purchase_receipts'))return [{id:'pr1',total_minor:10000}];
   if(sql.includes('SUM(amount_minor) AS amount FROM supplier_payments'))return [{amount:3000}];
   if(sql.includes('SUM(total_minor) AS amount FROM supplier_returns'))return [{amount:1000}];
   return [];
  });
  const repo=new DistributionRepository(db,()=> '2026-11-21T10:00:00.000Z',()=> 'generated');
  await expect(repo.recordSupplierPayment({id:'pay1',supplierId:'s1',purchaseReceiptId:'pr1',amountMinor:7000,method:'cash',paidBy:'owner'})).rejects.toThrow('كيتجاوز');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  expect(db.commitTransaction).not.toHaveBeenCalled();
 });
});
