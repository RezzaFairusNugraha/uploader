import type { ComponentType } from "react";
import {
  UploadCloud,
  LayoutDashboard,
  Upload,
  Layers,
  Clock,
  BarChart3,
  BookOpen,
} from "lucide-react";

export interface SubMenuItem {
  label: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
}

export interface ModuleItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  items: SubMenuItem[];
}

export const MODULES: ModuleItem[] = [
  {
    id: "uploader",
    label: "Uploader",
    icon: UploadCloud,
    items: [
      { label: "Unggah", href: "/uploader", icon: Upload },
      { label: "Template", href: "/uploader/template", icon: Layers },
      { label: "Riwayat", href: "/uploader/riwayat", icon: Clock },
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      {
        label: "Mekari Talenta",
        href: "/dashboard/mekari-talenta",
        icon: BarChart3,
      },
    ],
  },
];

export const PANDUAN_ITEM: SubMenuItem = {
  label: "Panduan",
  href: "/panduan",
  icon: BookOpen,
};
