import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/forgot-password", "/reset-password", "/confirm-signup"] }, sitemap: "https://arbor.ph/sitemap.xml" };
}
