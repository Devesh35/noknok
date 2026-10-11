import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { QueryProvider } from "@/api";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "NokNok — find something to do", template: "%s · NokNok" },
  description:
    "Discover and join parties, sports, treks and events around Ulhasnagar, Ambernath, Vitthalwadi and Kalyan.",
  appleWebApp: { capable: true, title: "NokNok" },
  icons: { apple: "/icons/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#090a12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <QueryProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
