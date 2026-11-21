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
   if(sql.includes('FROM supplier_payments WHERE purchase_receipt_id'))return [{amount:3000}];
   if(sql.includes('FROM supplier_returns WHERE purchase_receipt_id'))return [{amount:1000}];
   return [];
  });
  const repo=new DistributionRepository(db,()=> '2026-11-21T10:00:00.000Z',()=> 'generated');
  await expect(repo.recordSupplierPayment({id:'pay1',supplierId:'s1',purchaseReceiptId:'pr1',amountMinor:7000,method:'cash',paidBy:'owner'})).rejects.toThrow('كيتجاوز');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  expect(db.commitTransaction).not.toHaveBeenCalled();
 });
 it('reconciles the opening float plus all cash collected during the business day',async()=>{
  const db=makeDb(sql=>{
   if(sql.includes('FROM vehicle_day_sessions'))return [{id:'day1',vehicle_id:'v1',opening_odometer:100,opening_cash_minor:2000,expected_cash_minor:2000,status:'open',opened_at:'2026-11-21T08:00:00Z',business_date:'2026-11-21'}];
   if(sql.includes('FROM stock_locations'))return [{id:'loc-v1'}];
   if(sql.includes('FROM stock_balances WHERE location_id'))return [];
   if(sql.includes('FROM cash_sessions'))return [{amount:15000}];
   return [];
  });
  const repo=new DistributionRepository(db,()=> '2026-11-21T18:00:00Z',()=> 'generated');
  const result=await repo.closeVehicleDay({sessionId:'day1',responsibleUserId:'driver1',closingOdometer:140,countedCashMinor:17000,counts:[]});
  expect(result).toEqual({cashDifferenceMinor:0,stockVariances:0});
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining("substr(opened_at,1,10)=?"),['v1','driver1','2026-11-21']);
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('SET expected_cash_minor=?'),expect.arrayContaining([17000]));
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });

 it('records a supplier return and deducts the matching depot batch atomically',async()=>{
  const db=makeDb(sql=>{
   if(sql.includes('SELECT id FROM suppliers'))return [{id:'s1'}];
   if(sql.includes('FROM stock_balances sb JOIN products'))return [{id:'bal1',batch_id:'lot1',quantity:8,product_name:'ماء'}];
   return [];
  });
  const repo=new DistributionRepository(db,()=> '2026-11-21T12:00:00Z',()=> 'generated');
  const result=await repo.createSupplierReturn({id:'sr1',supplierId:'s1',reason:'سلعة تالفة',processedBy:'owner',lines:[{productId:'p1',batchId:'lot1',quantity:3,unitCostMinor:250}]});
  expect(result).toEqual({totalMinor:750,lineCount:1});
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO supplier_return_lines'),expect.arrayContaining(['sr1','p1','lot1',3,250,750,'ماء']));
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE stock_balances'),[5,'2026-11-21T12:00:00Z','bal1']);
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });
 it('rolls back supplier return if depot stock is insufficient',async()=>{
  const db=makeDb(sql=>{
   if(sql.includes('SELECT id FROM suppliers'))return [{id:'s1'}];
   if(sql.includes('FROM stock_balances sb JOIN products'))return [{id:'bal1',batch_id:'lot1',quantity:2,product_name:'ماء'}];
   return [];
  });
  const repo=new DistributionRepository(db);
  await expect(repo.createSupplierReturn({id:'sr1',supplierId:'s1',reason:'إرجاع',processedBy:'owner',lines:[{productId:'p1',batchId:'lot1',quantity:3,unitCostMinor:250}]})).rejects.toThrow('المخزون المتوفر');
  expect(db.rollbackTransaction).toHaveBeenCalledOnce();
  expect(db.commitTransaction).not.toHaveBeenCalled();
 });

 it('opens a van-sales vehicle day with opening float and assigned seller',async()=>{
  const db=makeDb(sql=>sql.includes('FROM vehicles WHERE id=?')?[{id:'van1',vehicle_type:'van_sales',assigned_user_id:'seller1'}]:[]);
  const repo=new DistributionRepository(db,()=> '2026-11-21T08:00:00Z',()=> 'generated');
  await repo.startVehicleDay({id:'day1',vehicleId:'van1',responsibleUserId:'seller1',businessDate:'2026-11-21',openingCashMinor:1000,expectedCashMinor:2500});
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO vehicle_day_sessions'),expect.arrayContaining([1000,3500]));
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });

 it('assigns an attached ready order to the route vehicle when it was unassigned',async()=>{
  const db=makeDb(sql=>{
   if(sql.includes('FROM vehicles v'))return [{id:'v1',vehicle_type:'delivery',assigned_user_id:'d1',role:'delivery_driver',is_active:1}];
   if(sql.includes('FROM customers'))return [{id:'c1'}];
   if(sql.includes('FROM sales_orders WHERE id=?'))return [{id:'o1',customer_id:'c1',assigned_vehicle_id:null,status:'ready'}];
   return [];
  });
  const repo=new DistributionRepository(db,()=> '2026-11-21T10:00:00Z',()=> 'generated');
  await repo.createRoute({id:'r1',code:'R-1',name:'جولة',plannedDate:'2026-11-22',vehicleId:'v1',driverUserId:'d1',createdBy:'owner',stops:[{id:'s1',customerId:'c1',orderId:'o1',stopOrder:1}]});
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('UPDATE sales_orders SET assigned_vehicle_id=?'),['v1','2026-11-21T10:00:00Z','o1']);
  expect(db.commitTransaction).toHaveBeenCalledOnce();
 });

});
