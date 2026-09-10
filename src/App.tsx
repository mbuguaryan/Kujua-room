import { Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { HomeEntry } from "@/components/kujua-room/HomeEntry";
import { HostDashboard } from "@/components/kujua-room/HostDashboard";
import { HostLogin } from "@/components/kujua-room/HostLogin";
import { RoomApp } from "@/components/kujua-room/RoomApp";
import { ErrorBoundary } from "./ErrorBoundary";
import { NotFound } from "./NotFound";

/**
 * Replaces app/r/[slug]/page.tsx. That server component read the dynamic
 * segment and the query string, then handed RoomApp plain props; this does the
 * same on the client so RoomApp itself is unchanged.
 */
function RoomRoute() {
  const { slug } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  if (!slug) return <NotFound />;
  return (
    <RoomApp
      slug={slug}
      inviteToken={search.get("invite") ?? ""}
      hostEntry={search.get("host") === "1"}
      initialName={search.get("name") ?? ""}
      hostAccess={search.get("access") === "public" ? "public" : "private"}
    />
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<HomeEntry />} />
            <Route path="/host" element={<HostDashboard />} />
            <Route path="/host/login" element={<HostLogin />} />
            <Route path="/r/:slug" element={<RoomRoute />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
