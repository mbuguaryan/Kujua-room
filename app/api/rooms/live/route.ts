import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/security/http";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { try { const admin=createAdminClient(); const {data,error}=await admin.from("sessions").select("id,title,started_at,rooms!inner(id,slug,name,description,access_mode,status)").eq("status","live").eq("rooms.status","active").eq("rooms.access_mode","public").order("started_at",{ascending:false}); if(error) throw error; return NextResponse.json({rooms:(data??[]).map((item)=>{const room=item.rooms as unknown as {id:string;slug:string;name:string;description:string|null}; return {id:room.id,slug:room.slug,name:room.name,description:room.description,sessionId:item.id,title:item.title,startedAt:item.started_at};})}); } catch(error){return apiError(error,"live_rooms_failed");} }
