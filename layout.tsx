import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI OCR Studio - Intelligent Document Processing & AI Cleaner",
  description:
    "Production-ready document intelligence SaaS powered by Azure Document Intelligence and OpenAI GPT-5.5. Extract, validate, clean, and export structured invoice and identity data.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#070913] text-slate-100 selection:bg-sky-500/30 selection:text-sky-300">
        {children}
      </body>
    </html>
  );
}
