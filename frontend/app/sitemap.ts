import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://arbor.ph", changeFrequency: "monthly", priority: 1 }];
}
