import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";

/**
 * The two doors into the product, side by side, on every public screen.
 * Audience carries the fill because listeners outnumber hosts; Host sits
 * quieter beside it.
 *
 * The inner wrapper holds the nav to the same column as the hero copy and the
 * Live now list, so the mark lines up with the headline underneath it rather
 * than floating out at the window edge.
 */
export function SiteNav({ active }: { active?: "host" | "audience" }) {
  return (
    <nav className="site-nav" aria-label="Main">
      <div className="site-nav-inner">
        <Link className="site-brand" to="/">
          <BrandMark />
          <span className="site-wordmark">Kujua Room</span>
        </Link>

        <div className="site-actions">
          <Link
            className="site-btn ghost"
            to="/host/login"
            aria-current={active === "host" ? "page" : undefined}
          >
            Host
          </Link>
          <Link
            className="site-btn solid"
            to="/join"
            aria-current={active === "audience" ? "page" : undefined}
          >
            Audience
          </Link>
        </div>
      </div>
    </nav>
  );
}
