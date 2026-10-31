'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
export function CompositeCard({clip}:{clip:{id:string;title:string;videoURL:string;posterURL:string;posterTime:number;hoverStart:number;baseURL:string;media:{duration:number;fps:number}}}){
  const video=useRef<HTMLVideoElement>(null),[hovering,setHovering]=useState(false);
  return <Link href={`/review/${clip.id}`} style={{display:'block',border:'1px solid #ffffff20',borderRadius:5,overflow:'hidden',background:'#171b15'}} onMouseEnter={()=>{setHovering(true);if(video.current){video.current.currentTime=clip.hoverStart;video.current.play().catch(()=>setHovering(false));}}} onMouseLeave={()=>{setHovering(false);video.current?.pause();}} onFocus={()=>{setHovering(true);if(video.current){video.current.currentTime=clip.hoverStart;video.current.play().catch(()=>setHovering(false));}}} onBlur={()=>{setHovering(false);video.current?.pause();}}>
    <div style={{aspectRatio:'32/9',overflow:'hidden',position:'relative'}}><video ref={video} src={clip.videoURL} preload="metadata" muted playsInline loop style={{display:'block',width:'100%',aspectRatio:'2/1',opacity:hovering?1:0}}/><img src={`${clip.baseURL}/frames/${String(clip.posterTime).padStart(3,'0')}.jpg`} alt={clip.title} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:hovering?0:1}}/></div>
    <div style={{padding:'20px 23px',display:'flex',justifyContent:'space-between',gap:20}}><div><p className="mono dim" style={{fontSize:10,marginBottom:8}}>LOS ANGELES · {clip.id.toUpperCase()}</p><h2 style={{fontSize:24,fontWeight:450}}>{clip.title}</h2></div><span className="mono dim" style={{fontSize:11,alignSelf:'center'}}>4K · {clip.media.fps} FPS · {clip.media.duration.toFixed(1)} SEC ↗</span></div>
  </Link>;
}
