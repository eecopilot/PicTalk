<template>
  <el-dialog v-model="localVisible" title="导入 JSON" width="680px">
    <div class="import-dialog">
      <el-input
        v-model="localJsonText"
        type="textarea"
        :rows="14"
        placeholder='粘贴 JSON，例如 {"regions":[{"text":"...","xPercent":10,"yPercent":20,"widthPercent":18,"heightPercent":8}]}'
      />
    </div>
    <template #footer>
      <div class="import-footer">
        <el-button :icon="CopyDocument" @click="$emit('copy-prompt')">复制提示词</el-button>
        <div class="import-footer-actions">
          <el-button @click="localVisible = false">取消</el-button>
          <el-button type="primary" :loading="importing" @click="$emit('import')">导入</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue';
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  jsonText: string;
  importing: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
  'update:jsonText': [text: string];
  'copy-prompt': [];
  import: [];
}>();

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

const localJsonText = computed({
  get: () => props.jsonText,
  set: (value) => emit('update:jsonText', value)
});
</script>
