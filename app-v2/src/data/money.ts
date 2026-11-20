/** New database monetary amounts use integer Moroccan centimes. */
export function madToMinorUnits(amountMad:number):number {
 if(!Number.isFinite(amountMad)||amountMad<0) throw new RangeError('المبلغ خاصو يكون رقم موجب أو صفر.');
 const value=Math.round((amountMad+Number.EPSILON)*100);
 if(!Number.isSafeInteger(value)) throw new RangeError('المبلغ كبير بزاف على التخزين الآمن.');
 return value;
}
export function minorUnitsToMad(amountMinor:number):number {
 if(!Number.isSafeInteger(amountMinor)||amountMinor<0) throw new RangeError('قيمة السنتيم خاصها تكون عدداً صحيحاً موجباً أو صفراً.');
 return amountMinor/100;
}
export function formatMad(amountMinor:number,locale='ar-MA'):string {
 return new Intl.NumberFormat(locale,{style:'currency',currency:'MAD',minimumFractionDigits:2,maximumFractionDigits:2}).format(minorUnitsToMad(amountMinor));
}
