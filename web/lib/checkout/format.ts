import type {OrderItem} from '../order';
export const money=(value:number|null)=>value===null?'To be confirmed':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
export const estimateTotal=(items:OrderItem[])=>items.some(i=>i.estimateUsd===null)?null:items.reduce((n,i)=>n+(i.estimateUsd??0),0);
export function rangeLabel(item:OrderItem){return item.inFrame!==null&&item.outFrame!==null?`Frames ${item.inFrame.toLocaleString()}–${item.outFrame.toLocaleString()} · ${item.fps??'?'} fps · ${item.durationSeconds?.toFixed(2)??'?'} sec`:`Full clip${item.durationSeconds?` · ${item.durationSeconds.toFixed(1)} sec`:''}`;}
