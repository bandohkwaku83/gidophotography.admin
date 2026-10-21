import type { Metadata } from "next";
import { Libre_Franklin, Geist_Mono, Newsreader } from "next/font/google";
import { AppBootstrap } from "@/components/app-bootstrap";
import { ToastProvider } from "@/components/toast-provider";
import "./globals.css";

const libreSans = Libre_Franklin({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
  ),
  title: "Gido Studio — proofing & delivery",
  description: "Photographer and client gallery experience (UI demo).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${libreSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <AppBootstrap>{children}</AppBootstrap>
        </ToastProvider>
      </body>
    </html>
  );
}
