import type { Metadata } from "next";
import { Toaster } from "sonner";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal Data",
  description: "Validasi dan unggah berkas data ke Databricks",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full bg-[#fafafa] text-zinc-900 font-sans">
        <AppShell>{children}</AppShell>
        <Toaster
          position="bottom-right"
          theme="light"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "bg-white border border-zinc-200 rounded-xl shadow-xs px-4 py-3 text-zinc-900 font-sans",
              title: "text-sm font-medium text-zinc-900",
              description: "text-[13px] text-zinc-500 mt-0.5",
              closeButton:
                "opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-700",
              icon: "w-4 h-4 mr-2",
              success: "[&_[data-icon]]:text-emerald-600",
              error: "[&_[data-icon]]:text-rose-600",
              warning: "[&_[data-icon]]:text-amber-600",
              info: "[&_[data-icon]]:text-zinc-600",
            },
          }}
        />
      </body>
    </html>
  );
}
