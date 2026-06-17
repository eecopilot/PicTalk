<template>
  <el-dialog v-model="localVisible" title="创建新书本" width="520px">
    <div class="create-book-dialog">
      <el-form label-position="top">
        <el-form-item label="书本名称">
          <el-input v-model="localBookName" placeholder="例如：小学英语课本第一册" clearable />
        </el-form-item>
        <el-form-item label="上传页面（可选）">
          <el-upload
            v-model:file-list="localUploadFiles"
            :auto-upload="false"
            accept="image/*"
            multiple
            list-type="picture-card"
            :limit="50"
          >
            <el-icon class="upload-icon-small"><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <div class="upload-tip">可以先创建空书本，稍后在"编辑页面"中添加图片</div>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="localVisible = false">取消</el-button>
      <el-button type="primary" :loading="creating" @click="$emit('create')">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue';
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  bookName: string;
  uploadFiles: any[];
  creating: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  'update:bookName': [name: string];
  'update:uploadFiles': [files: any[]];
  create: [];
}>();

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

const localBookName = computed({
  get: () => props.bookName,
  set: (value) => emit('update:bookName', value)
});

const localUploadFiles = computed({
  get: () => props.uploadFiles,
  set: (value) => emit('update:uploadFiles', value)
});
</script>
