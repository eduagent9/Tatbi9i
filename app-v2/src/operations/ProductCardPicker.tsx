type ProductOption={id:string;name:string;sale_price_minor:number;image_local_uri:string|null;total_stock:number};
type Props={products:ProductOption[];value:string;onChange:(id:string)=>void;};
export function ProductCardPicker({products,value,onChange}:Props){
 return <div className="field-product-grid" role="group" aria-label="اختيار المنتج">
  {products.map(product=><button type="button" key={product.id} className={'field-product-card'+(value===product.id?' selected':'')} aria-pressed={value===product.id} onClick={()=>onChange(product.id)}>
   <span className="field-product-image">{product.image_local_uri?<img src={product.image_local_uri} alt={product.name}/>:<span>📦</span>}</span>
   <span className="field-product-details"><strong>{product.name}</strong><small>{(product.sale_price_minor/100).toFixed(2)} DH · متوفر {product.total_stock}</small></span>
  </button>)}
 </div>;
}
