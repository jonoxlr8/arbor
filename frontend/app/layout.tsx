import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppearanceProvider } from "@/components/app/Appearance";
import { appearanceInitScript } from "@/lib/appearance";
import { publicMetadata } from "@/lib/publicWebsite";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  icons: { icon: { url: "/icon.svg", type: "image/svg+xml" } },
  metadataBase: new URL("https://arbor.ph"),
  title: publicMetadata.title,
  description: publicMetadata.description,
  alternates: { canonical: "https://arbor.ph" },
  openGraph: { type: "website", siteName: "Arbor", locale: "en_PH", url: "https://arbor.ph", ...publicMetadata },
  twitter: { card: "summary_large_image", ...publicMetadata },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{ __html: appearanceInitScript }} /></head>
      <body className="min-h-full flex flex-col"><AppearanceProvider>{children}</AppearanceProvider></body>
    </html>
  );
}
