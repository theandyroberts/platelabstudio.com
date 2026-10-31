import React from 'react';
import {createRoot} from 'react-dom/client';
import {CompositeDetail} from '../web/components/CompositeDetail';
import {CompositeTagCatalog,type TaggedClip} from '../web/components/CompositeTags';
import {applyLabelEditorial} from '../shared/composite/label-editorial.mjs';
import '../web/app/globals.css';
import './style.css';
const base='/composite-review';
async function read(url:string){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('The review collection could not be loaded. Please reload.');return response.json();}
async function start(){
  const catalog:TaggedClip[]=await read(`${base}/catalog.json`);
  const url=new URL(location.href),catalogPage=url.pathname.replace(/\/$/,'')===`${base}/review`;
  const id=url.pathname.startsWith(`${base}/review/`)?url.pathname.slice(`${base}/review/`.length).replace(/\/$/,''):catalog[0]?.id;
  document.title=catalogPage?'Content search · The Plate Lab':'Clip review · The Plate Lab';
  let content;
  if(catalogPage)content=<CompositeTagCatalog clips={catalog} query={url.searchParams.get('tag')??''} base={base} publicReview/>;
  else{
    if(!catalog.some(clip=>clip.id===id))throw new Error('This clip is not in the review collection.');
    const rawClip=await read(`${base}/media/composite/${id}/clip.json`);
    const editorialURL=(catalog.find(c=>c.id===id) as TaggedClip&{labelEditorialURL?:string})?.labelEditorialURL;
    const clip=applyLabelEditorial(rawClip,editorialURL?await read(editorialURL):null);
    let overrides:Record<string,any>={};try{overrides=JSON.parse(localStorage.getItem(`tpl-team-review:${id}`)||'{}');}catch{}
    Object.assign(clip,{overrides,posterTime:overrides.posterTime??clip.posterTime,hoverStart:overrides.hoverStart??clip.hoverStart});
    content=<CompositeDetail clip={clip} reviewBasePath={base} browserReview/>;
  }
  createRoot(document.getElementById('root')!).render(<><header className="site-header"><div className="wrap"><a className="review-brand" href={`${base}/`}>THE PLATE LAB <small>360° ENVIRONMENTS</small></a><nav className="site-nav">{!catalogPage&&<a href="#content-tags">Tags ↓</a>}<a href={`${base}/review`}>Browse clips</a><a href={catalogPage?`${base}/#feedback`:'#feedback'} className="feedback-jump">Give feedback ↗</a></nav></div></header>{content}<footer className="site-footer"><div className="wrap"><p>Review copy · Source watermarks preserved</p><p>Use the feedback form to email your comments and review choices directly to Andy.</p></div></footer></>);
}
start().catch(error=>{document.getElementById('root')!.textContent=error.message;});
