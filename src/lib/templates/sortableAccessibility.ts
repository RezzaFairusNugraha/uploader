export const sortableAccessibility = {
  announcements: {
    onDragStart({ active }: { active: { id: string | number; data?: { current?: { name?: string; index?: number; total?: number } } } }) {
      const name = active.data?.current?.name || active.id;
      const index = (active.data?.current?.index ?? 0) + 1;
      const total = active.data?.current?.total;
      return total
        ? `Kolom ${name} diangkat. Posisi ${index} dari ${total}.`
        : `Kolom ${name} diangkat. Posisi ${index}.`;
    },
    onDragOver({ active, over }: { active: { id: string | number; data?: { current?: { name?: string } } }; over?: { id: string | number; data?: { current?: { index?: number } } } | null }) {
      if (!over) return undefined;
      const name = active.data?.current?.name || active.id;
      const overIndex = (over.data?.current?.index ?? 0) + 1;
      return `Kolom ${name} dipindah ke posisi ${overIndex}.`;
    },
    onDragEnd({ active, over }: { active: { id: string | number; data?: { current?: { name?: string } } }; over?: { id: string | number; data?: { current?: { index?: number } } } | null }) {
      const name = active.data?.current?.name || active.id;
      if (!over) {
        return `Pemindahan kolom ${name} dibatalkan.`;
      }
      return `Kolom ${name} diletakkan.`;
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
