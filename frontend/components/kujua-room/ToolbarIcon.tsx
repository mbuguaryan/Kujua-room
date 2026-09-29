type ToolbarIconName =
  | "smile"
  | "chat"
  | "users"
  | "agenda"
  | "notes"
  | "volume-x"
  | "mic"
  | "mic-off"
  | "hand"
  | "user-plus"
  | "log-out"
  | "power";

export function ToolbarIcon({ name }: { name: ToolbarIconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    style: { verticalAlign: "middle", marginRight: 6, flex: "0 0 auto" },
  };

  if (name === "smile") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14s1 3 4 3 4-3 4-3M8 8h.01M16 8h.01" />
      </svg>
    );
  }

  if (name === "chat") {
    return (
      <svg {...common}>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (name === "agenda") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 18h6" />
      </svg>
    );
  }

  if (name === "notes") {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h5" />
      </svg>
    );
  }

  if (name === "volume-x") {
    return (
      <svg {...common}>
        <path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" />
      </svg>
    );
  }

  if (name === "mic") {
    return (
      <svg {...common}>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
      </svg>
    );
  }

  if (name === "mic-off") {
    return (
      <svg {...common}>
        <path d="M9 9v1a3 3 0 0 0 5.12 2.12M15 5v4M5 10a7 7 0 0 0 11.41 5.41M19 10a7 7 0 0 1-.52 2.65M12 17v5M8 22h8M3 3l18 18" />
      </svg>
    );
  }

  if (name === "hand") {
    return (
      <svg {...common}>
        <path d="M18 11V6a2 2 0 0 0-4 0v4M14 10V4a2 2 0 0 0-4 0v6M10 10V5a2 2 0 0 0-4 0v8" />
        <path d="M6 11V9a2 2 0 0 0-4 0v5c0 4.4 3.6 8 8 8h2c4.4 0 8-3.6 8-8v-3a2 2 0 0 0-4 0" />
      </svg>
    );
  }

  if (name === "user-plus") {
    return (
      <svg {...common}>
        <path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8" cy="7" r="4" />
        <path d="M19 8v6M16 11h6" />
      </svg>
    );
  }

  if (name === "log-out") {
    return (
      <svg {...common}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
    </svg>
  );
}
