import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIMKeeper",
  description: "Self-hosted SIM & eSIM lifecycle manager",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
