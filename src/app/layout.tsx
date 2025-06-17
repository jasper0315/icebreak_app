import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TeamProvider } from "@/contexts/TeamContext";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Icebreak",
  description: "会議の冒頭で初対面の人同士の緊張をほぐすAIアシスタント",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={inter.variable}>
      <body className={inter.className}>
        <TeamProvider>
          {children}
        </TeamProvider>
      </body>
    </html>
  );
}
