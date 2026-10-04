import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NokNok",
    short_name: "NokNok",
    description: "Discover and join parties, sports, treks and events around you.",
    start_url: "/",
    display: "standalone",
    background_color: "#090a12",
    theme_color: "#090a12",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
