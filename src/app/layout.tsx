import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const notoSansSc = localFont({
  variable: "--font-noto-sans-sc",
  display: "swap",
  src: [
    { path: "./fonts/noto-sans-sc-chinese-simplified-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/noto-sans-sc-chinese-simplified-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/noto-sans-sc-chinese-simplified-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const spaceGrotesk = localFont({
  variable: "--font-space-grotesk",
  display: "swap",
  src: [
    { path: "./fonts/space-grotesk-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./fonts/space-grotesk-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/space-grotesk-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/space-grotesk-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "派单管理系统",
  description: "Next.js + SQLite + Prisma + NextAuth 前后端一体项目",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "派单管理系统",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSansSc.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
