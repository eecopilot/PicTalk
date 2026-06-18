import { ref } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from '../element-plus';
import type { Book, SaveRecord, TextRegion } from '../types';

type HistoryManagerDeps = {
  regions: Ref<TextRegion[]>;
  selectedLocalId: Ref<string | null>;
  editingLocalId: Ref<string | null>;
  creating: Ref<boolean>;
  stopPageReading: () => void;
};

export function useHistoryManager(deps: HistoryManagerDeps) {
  const { regions, selectedLocalId, editingLocalId, creating, stopPageReading } = deps;

  const saveRecords = ref<SaveRecord[]>([]);
  const books = ref<Book[]>([]);
  const historyVisible = ref(false);
  const historyTab = ref<'books' | 'records'>('records');

  async function loadSaveRecords() {
    const response = await fetch('/api/save-records');
    if (!response.ok) return;
    const data = await response.json();
    saveRecords.value = data.records;
  }

  async function loadBooks() {
    const response = await fetch('/api/books');
    if (!response.ok) return;
    const data = await response.json();
    books.value = data.books;
  }

  async function openHistory() {
    await loadSaveRecords();
    await loadBooks();
    historyVisible.value = true;
  }

  async function deleteSaveRecord(record: SaveRecord) {
    const response = await fetch(`/api/save-records/${record.id}`, { method: 'DELETE' });
    if (!response.ok) {
      ElMessage.error('删除历史失败');
      return;
    }
    saveRecords.value = saveRecords.value.filter((item) => item.id !== record.id);
  }

  async function clearSaveRecords() {
    stopPageReading();
    const response = await fetch('/api/save-records', { method: 'DELETE' });
    if (!response.ok) {
      ElMessage.error('清空历史失败');
      return;
    }
    const data = await response.json().catch(() => null);
    saveRecords.value = [];
    regions.value = [];
    selectedLocalId.value = null;
    editingLocalId.value = null;
    creating.value = false;
    ElMessage.success(`已清空历史和 ${data?.regionsDeleted ?? 0} 个标注`);
  }

  return {
    saveRecords,
    books,
    historyVisible,
    historyTab,
    loadSaveRecords,
    loadBooks,
    openHistory,
    deleteSaveRecord,
    clearSaveRecords
  };
}
