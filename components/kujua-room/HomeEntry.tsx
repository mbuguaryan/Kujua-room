"use client";
import { useEffect,useState } from "react";
import { useRouter,useSearchParams } from "next/navigation";
import type { LiveRoomSummary } from "@/types/room";

export function HomeEntry(){
  const [rooms,setRooms]=useState<LiveRoomSummary[]>([]);
  const [name,setName]=useState("");
  const [hostAccess,setHostAccess]=useState<"public"|"private">("private");
  const router=useRouter();
  const search=useSearchParams();
  useEffect(()=>{void fetch("/api/rooms/live",{cache:"no-store"}).then(r=>r.json()).then((b:{rooms?:LiveRoomSummary[]})=>setRooms(b.rooms??[])).catch(()=>setRooms([]));},[]);
  const enter=(slug:string)=>{const q=new URLSearchParams();q.set("name",name.trim());const invite=search.get("invite");if(invite)q.set("invite",invite);router.push(`/r/${slug}?${q}`);};
  return <main className="home-screen"><section className="home-hero"><div className="brand-mark">K</div><h1>Kujua Room</h1><p>Join a live conversation or enter as the room host.</p><div className="entry-grid"><div className="entry-card"><strong>Host</strong><span>Create rooms and start sessions with their own titles, agendas and goals.</span><label className="form-label">Default room visibility</label><div className="host-access-choice"><button type="button" className={hostAccess==="public"?"active":""} onClick={()=>setHostAccess("public")}><b>Public</b><small>Live sessions can appear under Live now.</small></button><button type="button" className={hostAccess==="private"?"active":""} onClick={()=>setHostAccess("private")}><b>Private</b><small>Only people with the room/invite link can join.</small></button></div><a className="btn primary" href={`/host/login?access=${hostAccess}`}>Continue as host</a></div><div className="entry-card"><strong>Audience</strong><span>Choose a live public room.</span><label className="form-label" htmlFor="audience-name">Your name</label><input id="audience-name" className="form-input" value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></div></div><section className="live-list"><h2>Live now</h2>{rooms.length?rooms.map(room=><article key={room.sessionId}><div><strong>{room.name}</strong><p>{room.title}</p>{room.description?<small>{room.description}</small>:null}</div><button className="btn small primary" disabled={!name.trim()} onClick={()=>enter(room.slug)}>Join</button></article>):<p>No public rooms are live right now. Invitation links still open private sessions directly.</p>}</section></section></main>}
