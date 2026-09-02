import { Suspense } from "react";
import { HostDashboard } from "@/components/kujua-room/HostDashboard";

export const dynamic = "force-dynamic";

export default function HostPage() {
  return (
    <Suspense>
      <HostDashboard />
    </Suspense>
  );
}
