import fs from 'node:fs/promises';
import path from 'node:path';
import {json,writeJSON,command} from './core.mjs';
import {fileURLToPath} from 'node:url';
export const escapeXML=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function mapProjection(fixes) {
  const lat0=fixes.reduce((s,p)=>s+p.lat,0)/fixes.length,cos=Math.cos(lat0*Math.PI/180);
  const xs=fixes.map(p=>p.lon*cos),ys=fixes.map(p=>-p.lat);
  const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const span=Math.max((Math.max(...xs)-Math.min(...xs))*1.35,(Math.max(...ys)-Math.min(...ys))*1.8,0.003);
  const height=span*0.65;
  return {width:1000,height:650,bbox:[-(cy+height/2),(cx-span/2)/cos,-(cy-height/2),(cx+span/2)/cos],point:p=>[500+(p.lon*cos-cx)/span*1000,325+(-p.lat-cy)/height*650]};
}
export async function buildMap(summary,out,work) {
  const projection=mapProjection(summary.fixes),key=projection.bbox.map(x=>x.toFixed(6)).join(',');
  let raw;
  try { const cache=await json(path.join(work,'osm.json')); if(cache.bbox===key)raw=cache; } catch {}
  if(!raw) {
    // Official bounded OSM API is a reliable small-area fallback when Overpass is busy.
    const [south,west,north,east]=projection.bbox;
    const endpoint=`https://api.openstreetmap.org/api/0.6/map?bbox=${west},${south},${east},${north}`;
    try {
      const xml=path.join(work,'osm-source.xml');
      await command('curl',['--fail','--location','--max-time','60','--silent','--show-error','--output',xml,endpoint]);
      const data=JSON.parse(await command('python3',[fileURLToPath(new URL('./osm-xml.py',import.meta.url)),xml]));
      if(!data.elements.length)throw new Error('Empty OSM map');
      raw={bbox:key,retrievedAt:new Date().toISOString(),endpoint,elements:data.elements};
      await writeJSON(path.join(work,'osm.json'),raw);
    } catch(error) {console.log(`Bounded OSM fetch unavailable: ${error.message}; trying Overpass`);}
  }
  if(!raw) {
    const query=`[out:json][timeout:45];(way[highway](${key});way[building](${key});way[waterway](${key});way[natural=water](${key});way[railway](${key});way[leisure=park](${key}););out geom;`;
    let last;
    for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']) {
      try {
        const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'ThePlateLab-local-pilot/1.0'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(60000)});
        if(!response.ok) throw new Error(`Map endpoint ${response.status}`);
        const data=await response.json();if(data.remark || !data.elements?.length)throw new Error('Incomplete map response');
        raw={bbox:key,retrievedAt:new Date().toISOString(),endpoint,elements:data.elements};break;
      }catch(error){last=error;}
    }
    if(!raw)throw last;
    await writeJSON(path.join(work,'osm.json'),raw);
  }
  const layers={land:[],buildings:[],water:[],rail:[],roads:[]},labels=[],seen=new Set();
  const points=geometry=>geometry.map(p=>projection.point(p).map(v=>v.toFixed(1)).join(',')).join(' ');
  for(const way of raw.elements) {
    if(!way.geometry?.length)continue;const t=way.tags ?? {},p=points(way.geometry);
    if(t.building)layers.buildings.push(`<polygon points="${p}" fill="#deddd3" stroke="#d4d3c8" stroke-width="0.7"/>`);
    else if(t.leisure)layers.land.push(`<polygon points="${p}" fill="#d3dfcb"/>`);
    else if(t.waterway || t.natural==='water')layers.water.push(`<${t.waterway?'polyline':'polygon'} points="${p}" fill="${t.waterway?'none':'#bcd4d5'}" stroke="#bcd4d5" stroke-width="${t.waterway==='river'?22:4}"/>`);
    else if(t.railway)layers.rail.push(`<polyline points="${p}" fill="none" stroke="#b6b5ae" stroke-width="1.4" stroke-dasharray="5 4"/>`);
    else if(t.highway) {
      const major=['primary','secondary','trunk','motorway','tertiary'].includes(t.highway),width=major?9:3.5;
      layers.roads.push(`<polyline points="${p}" fill="none" stroke="#cecbbf" stroke-width="${width+2}"/><polyline points="${p}" fill="none" stroke="${major?'#fffdf5':'#faf9f1'}" stroke-width="${width}"/>`);
      if(t.name && !seen.has(t.name) && !['footway','path','cycleway','service'].includes(t.highway)) {
        const mid=projection.point(way.geometry[Math.floor(way.geometry.length/2)]);
        if(mid[0]>70&&mid[0]<930&&mid[1]>45&&mid[1]<590 && labels.every(l=>Math.hypot(l.x-mid[0],l.y-mid[1])>75)) {
          seen.add(t.name);labels.push({name:t.name,x:mid[0],y:mid[1]});
        }
      }
    }
  }
  const paths=summary.segments.filter(s=>s.length>1).map(s=>points(s));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" role="img" aria-label="Recorded route on OpenStreetMap street geography"><rect width="1000" height="650" fill="#ebece4"/>${Object.values(layers).flat().join('')}${labels.map(l=>`<text x="${l.x}" y="${l.y}" font-family="Arial,sans-serif" font-size="12" fill="#75766b" stroke="#ebece4" stroke-width="3" paint-order="stroke">${escapeXML(l.name)}</text>`).join('')}${paths.map(p=>`<polyline points="${p}" fill="none" stroke="#fff8ee" stroke-width="12" stroke-linejoin="round"/><polyline points="${p}" fill="none" stroke="#bb542e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}<text x="960" y="43" font-family="Arial" font-size="15" text-anchor="middle" fill="#555d53">N</text><path d="M960 52 L955 68 L965 68 Z" fill="#555d53"/></svg>`;
  await fs.writeFile(path.join(out,'map.svg'),svg);
  // Local proximity is context, not a claim that the vehicle traversed every nearby road.
  const roads=[...new Set(raw.elements.filter(e=>e.tags?.highway&&e.tags?.name).map(e=>e.tags.name))].sort();
  return {url:'map.svg',attribution:'© OpenStreetMap contributors',licenseURL:'https://www.openstreetmap.org/copyright',retrievedAt:raw.retrievedAt,bbox:projection.bbox,roads,segments:summary.segments.map(s=>s.map(p=>({...p,xy:projection.point(p)}))),features:raw.elements.length};
}
