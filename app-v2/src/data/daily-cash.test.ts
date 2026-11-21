import {describe,expect,it} from 'vitest';
import {calculateExpectedCash} from './daily-cash';
describe('daily cash closing calculations',()=>{
 it('calculates cash expected after receipts and cash outflows',()=>{expect(calculateExpectedCash(10000,8500,500,1000,2000)).toBe(15000);});
 it('rejects negative or unsafe amounts',()=>{expect(()=>calculateExpectedCash(-1,0,0,0,0)).toThrow();expect(()=>calculateExpectedCash(1,0,0,0,Number.MAX_SAFE_INTEGER)).toThrow();});
 it('rejects an expected negative cash balance',()=>{expect(()=>calculateExpectedCash(0,0,100,0,0)).toThrow();});
});
