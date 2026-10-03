import type { MetadataRoute } from "next";

// Shortcut name and artwork only. Keep the existing browser experience.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arbor",
    short_name: "Arbor",
    display: "browser",
    icons: [
      { src: "/icon1.png?03158d158ab6cf7f", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon2.png?e209bfe2951130dc", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
