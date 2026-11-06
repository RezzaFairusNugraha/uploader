import type { ComponentType } from "react";
import { Upload, Layers, Clock, BookOpen } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Unggah", href: "/", icon: Upload },
  { label: "Template", href: "/template", icon: Layers },
  { label: "Riwayat", href: "/riwayat", icon: Clock },
  { label: "Panduan", href: "/panduan", icon: BookOpen },
];
