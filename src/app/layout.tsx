import type { Metadata } from "next";
import { Geist } from "next/font/google";
import TopNav from "@/components/TopNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Data Uploader",
  description: "Validasi dan unggah berkas data ke Databricks",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#fafafa] text-zinc-900 font-sans">
        <TopNav />
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
