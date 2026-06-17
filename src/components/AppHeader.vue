<template>
  <header class="top-bar">
    <div>
      <h1>
        <img class="brand-logo" src="/logo.svg?v=2" alt="图片点读机" />
      </h1>
      <el-carousel
        class="tips-carousel"
        height="24px"
        direction="vertical"
        indicator-position="none"
        :interval="3600"
        arrow="never"
      >
        <el-carousel-item v-for="tip in tips" :key="tip">
          <p>{{ tip }}</p>
        </el-carousel-item>
      </el-carousel>
    </div>
    <div class="top-actions">
      <el-upload
        :show-file-list="false"
        :http-request="handleUpload"
        accept="image/*"
        class="upload-control"
      >
        <el-button type="primary" :loading="uploading">
          {{ currentBook ? '添加新页' : '上传图片' }}
        </el-button>
      </el-upload>
      <el-button class="history-button" :icon="Expand" @click="$emit('open-history')" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { Expand } from '@element-plus/icons-vue';

defineProps<{
  tips: string[];
  currentBook: any;
  uploading: boolean;
}>();

const emit = defineEmits<{
  'open-history': [];
  upload: [request: any];
}>();

function handleUpload(request: any) {
  emit('upload', request);
}
</script>
