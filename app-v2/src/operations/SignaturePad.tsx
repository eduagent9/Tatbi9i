import {useRef,useState,type PointerEvent} from 'react';

type Props={value:string;onChange:(value:string)=>void};

/** Small touch-friendly signature pad; stores a compressed PNG data URL in the local proof record. */
export function SignaturePad({value,onChange}:Props){
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const drawing=useRef(false);
 const [hasInk,setHasInk]=useState(Boolean(value));
 function point(event:PointerEvent<HTMLCanvasElement>){const canvas=canvasRef.current!;const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};}
 function start(event:PointerEvent<HTMLCanvasElement>){const canvas=canvasRef.current;if(!canvas)return;drawing.current=true;canvas.setPointerCapture(event.pointerId);const ctx=canvas.getContext('2d');if(!ctx)return;const p=point(event);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#183f50';}
 function move(event:PointerEvent<HTMLCanvasElement>){if(!drawing.current)return;const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;const p=point(event);ctx.lineTo(p.x,p.y);ctx.stroke();setHasInk(true);}
 function finish(){if(!drawing.current)return;drawing.current=false;const canvas=canvasRef.current;if(!canvas)return;onChange(canvas.toDataURL('image/png'));}
 function clear(){const canvas=canvasRef.current;if(canvas)canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);setHasInk(false);onChange('');}
 return <div className="signature-pad-wrap"><strong>توقيع المستلم</strong><canvas ref={canvasRef} width={640} height={180} aria-label="مساحة توقيع المستلم" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}/><div><small>{hasInk?'التوقيع مسجل':'وقع بإصبعك داخل الإطار'}</small><button type="button" className="secondary-button" onClick={clear}>مسح التوقيع</button></div></div>;
}
