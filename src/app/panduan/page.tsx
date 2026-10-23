"use client";

import { useState } from "react";
import { BookOpen, ChevronRight, HelpCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { PANDUAN_TOPICS } from "@/content/panduan";

export default function PanduanPage() {
  const [activeTopicId, setActiveTopicId] = useState(PANDUAN_TOPICS[0].id);

  const activeTopic =
    PANDUAN_TOPICS.find((t) => t.id === activeTopicId) || PANDUAN_TOPICS[0];

  return (
    <div className="space-y-8 text-base">
      <PageHeader
        title="Panduan Penggunaan"
        description="Petunjuk lengkap penggunaan Data Uploader untuk staf non-teknis."
      />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Menu Topik Samping */}
        <aside className="md:col-span-4 bg-white border border-zinc-200 rounded-xl p-3 space-y-1">
          <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-4 h-4" />
            Daftar Materi
          </div>
          {PANDUAN_TOPICS.map((topic) => {
            const isActive = topic.id === activeTopicId;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => setActiveTopicId(topic.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition flex items-center justify-between ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <span>{topic.title}</span>
                {isActive && <ChevronRight className="w-4 h-4 text-indigo-600 shrink-0" />}
              </button>
            );
          })}
        </aside>

        {/* Isi Topik */}
        <main className="md:col-span-8 bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-zinc-100 pb-4">
            <h2 className="text-xl font-bold text-zinc-900">
              {activeTopic.title}
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              {activeTopic.summary}
            </p>
          </div>

          <div className="space-y-4 text-base text-zinc-700 leading-relaxed">
            {activeTopic.content.map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>

          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 flex items-start gap-3 mt-6">
            <HelpCircle className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
            <div className="text-sm text-zinc-600">
              Butuh bantuan lebih lanjut atau menemukan kendala koneksi? Hubungi tim administrator atau pengelola sistem Databricks Anda.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
