import type { Metadata } from "next";
import "./globals.css";
import "./inventory.css";

export const metadata: Metadata = {
  title: "部品室 | 部品管理",
  description: "部室の部品在庫と使用・購入の履歴をGoogleスプレッドシートで管理。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "部品室", statusBarStyle: "default" },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
