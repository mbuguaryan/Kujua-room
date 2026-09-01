import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kujua Room",
    short_name: "Kujua",
    description: "Voice-only coaching rooms",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1c1f1e",
    theme_color: "#1c1f1e",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
