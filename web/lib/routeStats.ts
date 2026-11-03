export type RouteFix={t:number;lat:number;lon:number;clock?:string};

/** Ground speeds between GPS fixes, weighted by sampled time; never bridge route gaps. */
export function routeSpeeds(segments:RouteFix[][]){
  let meters=0,seconds=0,min=Infinity,max=-Infinity;
  const valid=(p:RouteFix)=>Number.isFinite(p.t)&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180;
  for(const segment of segments)for(let i=1;i<segment.length;i++){
    const a=segment[i-1],b=segment[i];
    if(!valid(a)||!valid(b)||b.t<=a.t)continue;
    const clockA=Date.parse(a.clock??''),clockB=Date.parse(b.clock??'');
    const dt=Number.isFinite(clockA)&&Number.isFinite(clockB)?(clockB-clockA)/1000:b.t-a.t;
    if(dt<=0||dt>5)continue;
    const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
    const distance=6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
    const speed=distance/dt*3.6;
    meters+=distance;seconds+=dt;min=Math.min(min,speed);max=Math.max(max,speed);
  }
  return seconds>0?{average:meters/seconds*3.6,min,max}:null;
}
