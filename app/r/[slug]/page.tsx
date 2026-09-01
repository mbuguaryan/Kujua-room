import { RoomApp } from "@/components/kujua-room/RoomApp";
export const dynamic = "force-dynamic";
export default async function RoomPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string; host?: string; name?: string }> }) { const [{ slug }, { invite, host, name }] = await Promise.all([params, searchParams]); return <RoomApp slug={slug} inviteToken={invite ?? ""} hostEntry={host === "1"} initialName={name ?? ""} />; }
