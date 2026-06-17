import type { App } from 'vue';
import { ElButton, ElButtonGroup } from 'element-plus/es/components/button/index.mjs';
import { ElCarousel, ElCarouselItem } from 'element-plus/es/components/carousel/index.mjs';
import ElDialog from 'element-plus/es/components/dialog/index.mjs';
import ElDrawer from 'element-plus/es/components/drawer/index.mjs';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs';
import ElIcon from 'element-plus/es/components/icon/index.mjs';
import ElInput from 'element-plus/es/components/input/index.mjs';
import ElSegmented from 'element-plus/es/components/segmented/index.mjs';
import ElTooltip from 'element-plus/es/components/tooltip/index.mjs';
import ElUpload from 'element-plus/es/components/upload/index.mjs';
import ElLoading from 'element-plus/es/components/loading/index.mjs';
import ElMessage from 'element-plus/es/components/message/index.mjs';
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs';

const components = [
  ElButton,
  ElButtonGroup,
  ElCarousel,
  ElCarouselItem,
  ElDialog,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElSegmented,
  ElTooltip,
  ElUpload
];

export function setupElementPlus(app: App) {
  components.forEach((component) => {
    app.component(component.name!, component);
  });

  // 注册全局服务
  app.config.globalProperties.$message = ElMessage;
  app.config.globalProperties.$messageBox = ElMessageBox;
  app.config.globalProperties.$loading = ElLoading;
}

// 导出服务供直接使用
export { ElLoading, ElMessage, ElMessageBox };
