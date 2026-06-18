import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { ElLoading, ElMessage, ElMessageBox } from '../element-plus';
import type { Book, BookPage, ReaderImage, TextRegion } from '../types';
import { normalizeRegion, readImageDimensions, resolveUploadFile } from '../utils/helpers';

type BookManagerDeps = {
  mode: Ref<'edit' | 'read'>;
  currentImage: Ref<ReaderImage | null>;
  regions: Ref<TextRegion[]>;
  selectedLocalId: Ref<string | null>;
  editingLocalId: Ref<string | null>;
  currentBook: Ref<Book | null>;
  bookPages: Ref<BookPage[]>;
  currentPageIndex: Ref<number>;
  historyVisible: Ref<boolean>;
  books: Ref<Book[]>;
  stopPageReading: () => void;
  updateFrameSize: () => void;
  loadBooks: () => Promise<void>;
};

export function useBookManager(deps: BookManagerDeps) {
  const {
    mode,
    currentImage,
    regions,
    selectedLocalId,
    editingLocalId,
    currentBook,
    bookPages,
    currentPageIndex,
    historyVisible,
    books,
    stopPageReading,
    updateFrameSize,
    loadBooks
  } = deps;

  const newBookName = ref('');
  const bookUploadFiles = ref<any[]>([]);
  const creatingBook = ref(false);
  const createBookDialogVisible = ref(false);

  async function loadBook(book: Book) {
    stopPageReading();
    const response = await fetch(`/api/books/${book.id}`);
    if (!response.ok) {
      ElMessage.error('加载书本失败');
      return;
    }
    const data = await response.json();
    currentBook.value = data.book;
    bookPages.value = data.pages;
    currentPageIndex.value = 0;

    historyVisible.value = false;

    if (bookPages.value.length === 0) {
      // 空书本直接进入编辑模式
      currentImage.value = null;
      regions.value = [];
      selectedLocalId.value = null;
      editingLocalId.value = null;
      mode.value = 'edit';
      ElMessage.info('请上传图片添加新页');
    } else {
      // 有页面直接进入编辑模式，显示第1页
      loadCurrentPage();
      mode.value = 'edit';
    }
  }

  async function deleteBook(book: Book) {
    const response = await fetch(`/api/books/${book.id}`, { method: 'DELETE' });
    if (!response.ok) {
      ElMessage.error('删除书本失败');
      return;
    }
    books.value = books.value.filter((item) => item.id !== book.id);
  }

  async function deleteCurrentPage() {
    if (!currentBook.value || !currentImage.value) return;
    stopPageReading();

    const currentPage = bookPages.value[currentPageIndex.value];
    if (!currentPage) return;

    try {
      await ElMessageBox.confirm(
        `确定删除第 ${currentPageIndex.value + 1} 页吗？`,
        '删除页面',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      );
    } catch {
      return;
    }

    const response = await fetch(`/api/books/${currentBook.value.id}/pages/${currentPage.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      ElMessage.error('删除页面失败');
      return;
    }

    // 从列表中移除
    bookPages.value.splice(currentPageIndex.value, 1);

    // 处理删除后的跳转
    if (bookPages.value.length === 0) {
      // 书本变空
      currentImage.value = null;
      regions.value = [];
      selectedLocalId.value = null;
      editingLocalId.value = null;
      ElMessage.success('页面已删除，书本现在为空');
    } else if (currentPageIndex.value >= bookPages.value.length) {
      // 删除的是最后一页，跳到前一页
      currentPageIndex.value = bookPages.value.length - 1;
      loadCurrentPage();
      ElMessage.success('页面已删除');
    } else {
      // 删除中间页，当前索引不变（显示下一页）
      loadCurrentPage();
      ElMessage.success('页面已删除');
    }
  }

  function openCreateBookDialog() {
    newBookName.value = '';
    bookUploadFiles.value = [];
    createBookDialogVisible.value = true;
  }

  async function createBook() {
    const name = newBookName.value.trim();
    if (!name) {
      ElMessage.warning('请输入书本名称');
      return;
    }

    creatingBook.value = true;

    // 如果有上传图片，显示加载提示
    let loading: ReturnType<typeof ElLoading.service> | null = null;
    if (bookUploadFiles.value.length > 0) {
      loading = ElLoading.service({
        lock: true,
        text: `正在创建书本，上传 ${bookUploadFiles.value.length} 张图片...`,
        background: 'rgba(243, 245, 248, 0.82)'
      });
    }

    try {
      // 创建书本
      const bookResponse = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!bookResponse.ok) throw new Error('创建书本失败');
      const bookData = await bookResponse.json();
      const book = bookData.book;

      // 如果有图片，上传所有图片并添加到书本
      if (bookUploadFiles.value.length > 0) {
        for (let i = 0; i < bookUploadFiles.value.length; i++) {
          const file = resolveUploadFile(bookUploadFiles.value[i]);
          if (!file) throw new Error(`第 ${i + 1} 张图片文件读取失败`);
          const dimensions = await readImageDimensions(file);
          const formData = new FormData();
          formData.append('image', file);
          formData.append('width', String(dimensions.width));
          formData.append('height', String(dimensions.height));

          const imageResponse = await fetch('/api/images', { method: 'POST', body: formData });
          if (!imageResponse.ok) throw new Error(`上传第 ${i + 1} 张图片失败`);
          const imageData = await imageResponse.json();

          const pageResponse = await fetch(`/api/books/${book.id}/pages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId: imageData.image.id })
          });
          if (!pageResponse.ok) throw new Error(`添加第 ${i + 1} 页失败`);
        }
        ElMessage.success(`书本「${name}」创建成功，共 ${bookUploadFiles.value.length} 页`);
      } else {
        ElMessage.success(`空书本「${name}」创建成功`);
      }

      createBookDialogVisible.value = false;

      // 重新加载书本列表
      await loadBooks();

      // 重新获取完整书本数据（包含所有页面）
      const fullBookResponse = await fetch(`/api/books/${book.id}`);
      if (fullBookResponse.ok) {
        const fullBookData = await fullBookResponse.json();
        currentBook.value = fullBookData.book;
        bookPages.value = fullBookData.pages;
        currentPageIndex.value = 0;

        if (bookPages.value.length === 0) {
          // 空书本直接进入编辑模式
          currentImage.value = null;
          regions.value = [];
          selectedLocalId.value = null;
          editingLocalId.value = null;
          mode.value = 'edit';
        } else {
          // 有页面直接进入编辑模式，显示第1页
          loadCurrentPage();
          mode.value = 'edit';
        }
      }
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '创建书本失败');
    } finally {
      creatingBook.value = false;
      loading?.close();
    }
  }

  function previousPage() {
    if (currentPageIndex.value > 0) {
      if (hasUnsavedChanges()) {
        ElMessageBox.confirm('当前页面有未保存的修改，切换页面后将丢失，确定继续吗？', '提示', {
          confirmButtonText: '继续',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          currentPageIndex.value--;
          loadCurrentPage();
        }).catch(() => {});
      } else {
        currentPageIndex.value--;
        loadCurrentPage();
      }
    }
  }

  function nextPage() {
    if (currentPageIndex.value < bookPages.value.length - 1) {
      if (hasUnsavedChanges()) {
        ElMessageBox.confirm('当前页面有未保存的修改，切换页面后将丢失，确定继续吗？', '提示', {
          confirmButtonText: '继续',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          currentPageIndex.value++;
          loadCurrentPage();
        }).catch(() => {});
      } else {
        currentPageIndex.value++;
        loadCurrentPage();
      }
    }
  }

  function hasUnsavedChanges() {
    if (!currentImage.value || !currentBook.value) return false;
    const currentPage = bookPages.value[currentPageIndex.value];
    if (!currentPage) return false;

    // 检查区域数量是否变化
    if (regions.value.length !== currentPage.regions.length) return true;

    // 检查是否有新建的区域（没有 id）
    if (regions.value.some(r => !r.id)) return true;

    // 检查现有区域是否被修改
    for (const region of regions.value) {
      const original = currentPage.regions.find(r => r.id === region.id);
      if (!original) return true;

      if (region.text !== original.text ||
          region.audioSource !== original.audioSource ||
          Math.abs(region.xPercent - original.xPercent) > 0.01 ||
          Math.abs(region.yPercent - original.yPercent) > 0.01 ||
          Math.abs(region.widthPercent - original.widthPercent) > 0.01 ||
          Math.abs(region.heightPercent - original.heightPercent) > 0.01) {
        return true;
      }
    }

    return false;
  }

  function loadCurrentPage() {
    const page = bookPages.value[currentPageIndex.value];
    if (!page) return;

    currentImage.value = page.image;
    regions.value = page.regions.map(normalizeRegion);
    selectedLocalId.value = null;
    editingLocalId.value = null;
    nextTick(() => updateFrameSize());
  }

  return {
    newBookName,
    bookUploadFiles,
    creatingBook,
    createBookDialogVisible,
    openCreateBookDialog,
    createBook,
    loadBook,
    deleteBook,
    deleteCurrentPage,
    loadCurrentPage,
    previousPage,
    nextPage,
    hasUnsavedChanges
  };
}
