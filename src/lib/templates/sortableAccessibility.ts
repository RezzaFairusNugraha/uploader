export const sortableAccessibility = {
  announcements: {
    onDragStart({ active }: { active: { id: string | number; data?: { current?: { name?: string; index?: number } } } }) {
      const name = active.data?.current?.name || active.id;
      const index = (active.data?.current?.index ?? 0) + 1;
      return `Kolom ${name} diangkat. Posisi ${index}.`;
    },
    onDragOver({ active, over }: { active: { id: string | number; data?: { current?: { name?: string } } }; over?: { id: string | number; data?: { current?: { index?: number } } } | null }) {
      if (!over) return undefined;
      const name = active.data?.current?.name || active.id;
      const overIndex = (over.data?.current?.index ?? 0) + 1;
      return `Kolom ${name} dipindahkan ke posisi ${overIndex}.`;
    },
    onDragEnd({ active, over }: { active: { id: string | number; data?: { current?: { name?: string } } }; over?: { id: string | number; data?: { current?: { index?: number } } } | null }) {
      const name = active.data?.current?.name || active.id;
      if (!over) {
        return `Pemindahan kolom ${name} dibatalkan.`;
      }
      const overIndex = (over.data?.current?.index ?? 0) + 1;
      return `Kolom ${name} diletakkan di posisi ${overIndex}.`;
    },
    onDragCancel({ active }: { active: { id: string | number; data?: { current?: { name?: string } } } }) {
      const name = active.data?.current?.name || active.id;
      return `Pemindahan kolom ${name} dibatalkan.`;
    },
  },
  screenReaderInstructions: {
    draggable:
      "Untuk mengambil kolom ini, tekan Spasi atau Enter. Gunakan panah atas dan bawah untuk mengubah posisi. Tekan Spasi lagi untuk meletakkan kolom.",
  },
};
