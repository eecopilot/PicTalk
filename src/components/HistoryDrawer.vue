<template>
  <el-drawer v-model="localVisible" title="保存历史" direction="rtl" size="320px">
    <div class="history-drawer">
      <el-segmented v-model="localTab" :options="historyTabOptions" />

      <div v-if="localTab === 'books'" class="history-content">
        <div class="create-book-button-wrapper">
          <el-button type="primary" :icon="Plus" @click="$emit('create-book')">创建新书本</el-button>
        </div>
        <div v-if="books.length === 0" class="history-empty">暂无书本</div>
        <div v-else class="history-list">
          <article
            v-for="book in books"
            :key="book.id"
            class="history-item"
            role="button"
            tabindex="0"
            @click.prevent.stop="$emit('load-book', book)"
            @keydown.enter.prevent.stop="$emit('load-book', book)"
          >
            <div class="history-item-content">
              <strong>{{ book.name }}</strong>
              <time>{{ formatDate(book.createdAt) }}</time>
            </div>
            <el-button
              class="history-delete"
              :icon="Delete"
              circle
              size="small"
              title="删除书本"
              @click.prevent.stop="$emit('delete-book', book)"
            />
          </article>
        </div>
      </div>

      <div v-if="localTab === 'records'" class="history-content">
        <div v-if="saveRecords.length === 0" class="history-empty">暂无保存记录</div>
        <div v-else class="history-list">
          <article
            v-for="record in saveRecords"
            :key="record.id"
            class="history-item"
            role="button"
            tabindex="0"
            @click.prevent.stop="$emit('load-record', record)"
            @keydown.enter.prevent.stop="$emit('load-record', record)"
          >
            <div class="history-item-content">
              <strong>{{ record.imageName }}</strong>
              <span>{{ record.regionCount }} 个点读标注</span>
              <time>{{ formatDate(record.createdAt) }}</time>
            </div>
            <el-button
              class="history-delete"
              :icon="Delete"
              circle
              size="small"
              title="删除历史"
              @click.prevent.stop="$emit('delete-record', record)"
            />
          </article>
        </div>
      </div>

      <div v-if="saveRecords.length > 0 || books.length > 0" class="history-footer">
        <el-button class="clear-history-button" type="danger" plain @click="$emit('clear-history')">
          清空历史
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { Delete, Plus } from '@element-plus/icons-vue';
import type { Book, SaveRecord } from '../types';
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  tab: 'books' | 'records';
  books: Book[];
  saveRecords: SaveRecord[];
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  'update:tab': [tab: 'books' | 'records'];
  'create-book': [];
  'load-book': [book: Book];
  'delete-book': [book: Book];
  'load-record': [record: SaveRecord];
  'delete-record': [record: SaveRecord];
  'clear-history': [];
}>();

const historyTabOptions = [
  { label: '单图', value: 'records' },
  { label: '书本', value: 'books' }
];

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

const localTab = computed({
  get: () => props.tab,
  set: (value) => emit('update:tab', value)
});

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
</script>
