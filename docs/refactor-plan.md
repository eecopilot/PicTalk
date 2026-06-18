# 重构方案：App.vue 与 server/index.ts

本文档只用于说明重构思路，不包含代码实现。

---

## 1. 为什么现在要重构

项目已经从“最小可用原型”进化成一个功能完整的产品：
- 图片上传与预览
- 百分比坐标文字区域
- 编辑/阅读模式
- OCR / JSON 导入
- 书本多页管理
- 历史记录
- TTS / Google 发音
- 全屏阅读

功能闭环已经具备，但主要复杂度仍然集中在两个文件：

- `src/App.vue`
- `server/index.ts`

继续扩展这两个文件的成本会越来越高，后续修 bug、加测试、做新功能都会更难。

---

## 2. 当前问题总结

### 2.1 `src/App.vue` 的问题

`App.vue` 目前承担了过多职责，至少包括：

- 图片上传与 OCR 结果初始化
- 区域创建、拖拽、缩放、删除
- 区域展开/折叠（编辑态 / 图标态）
- 阅读模式下的单点播放
- 整页朗读队列管理
- 历史记录与书本管理
- 页面切换与未保存检测
- 全屏控制
- 大量 UI 状态管理

**结果是：**

- `App.vue` 变成业务编排中心 + 状态中心
- 一个功能的小修改，容易牵连其他功能
- 很难做细粒度测试
- 阅读、编辑、书本三种逻辑互相干扰

### 2.2 `server/index.ts` 的问题

`server/index.ts` 目前至少承担以下职责：

- Hono 应用初始化
- 所有 API 路由
- SQLite 初始化
- 数据库迁移
- 图片/区域/书本/历史的数据访问
- OCR 调用与结果解析
- TTS URL 构造与音频代理
- 静态资源配置
- 错误处理与参数校验

**结果是：**

- 单文件过大
- 数据访问和业务逻辑混在一起
- 路由层和服务层没有边界
- OCR、TTS、DB 改动都会动同一个文件
- 难以扩展和测试

---

## 3. 重构目标

### 3.1 前端目标

把 `App.vue` 从“万能控制器”拆成：

1. **页面壳组件**：只负责布局与组件组合
2. **状态模块**：按业务拆分
3. **交互逻辑模块**：拖拽、播放、保存等独立封装
4. **纯展示/轻交互组件**：继续保留现有组件拆分方向

### 3.2 后端目标

把 `server/index.ts` 从“单体文件”拆成：

1. **路由层**
2. **服务层**
3. **数据访问层**
4. **外部能力层（OCR / TTS）**
5. **数据库初始化与迁移**

---

## 4. `src/App.vue` 重构方案

## 4.1 建议拆分结构

```
src/
  features/
    image/
      useImageUpload.ts
      useImageFrame.ts
    region/
      useRegionEditor.ts
      useRegionDragging.ts
      useRegionStyles.ts
    reading/
      useSingleReading.ts
      usePageReading.ts
    book/
      useBookManager.ts
      useHistoryManager.ts
    ui/
      useFullscreen.ts
      useKeyboardShortcuts.ts
  stores/
    reader.ts            # 可选，统一核心状态
  components/
    App.vue              # 仅组合逻辑和布局
    ...
```

---

## 4.2 推荐拆分的模块

### A. `useImageUpload`
**职责**
- 处理图片上传
- 解析图片尺寸
- 调用 `/api/images`
- 处理 OCR / cached regions 初始化
- 书本模式下追加新页

**从 App.vue 中移出的内容**
- `uploadImage()`
- `resolveUploadFile()`
- 上传 loading 状态
- OCR 结果初始化分支
- 部分 `ElMessage` 提示逻辑

**收益**
- 上传流程独立可测
- 后续支持批量上传、拖拽上传、失败重试更容易

---

### B. `useRegionEditor`
**职责**
- region 新建、选中、展开、折叠
- 编辑态切换
- 文字保存前校验
- 删除与保存流程编排

**从 App.vue 中移出的内容**
- `regions`
- `selectedLocalId`
- `editingLocalId`
- `creating`
- `creatingAudioSource`
- `collapseRegion()`
- `expandRegion()`
- `saveRegions()`
- `deleteRegion()`
- `playRegionAudio()`

**收益**
- 编辑流程独立
- 不再和书本/朗读高度耦合

---

### C. `useRegionDragging`
**职责**
- 拖拽模式判断
- pointer capture
- 百分比位置计算
- resize / move / icon 三种拖拽逻辑

**从 App.vue 中移出的内容**
- `dragging`
- `startDrag()`
- `handlePointerMove()`
- `stopDrag()`
- icon / box / resize 计算

**收益**
- 拖拽是典型独立交互逻辑，最容易单独测试
- 后续支持吸附、对齐、键盘微调时不会污染主组件

---

### D. `useRegionStyles`
**职责**
- `regionStyle()`
- `isIconRegion()`
- `iconXPercent()`
- `iconYPercent()`
- `iconPixelWidthPercent()`
- `iconPixelHeightPercent()`
- `compactEditorSize()`

**收益**
- 当前这些函数已经和 UI 状态高度相关
- 抽出来后主模板会清晰很多

---

### E. `useSingleReading`
**职责**
- 单个 region 的 TTS / Google 发音播放
- 播放状态、错误处理、中断处理

**从 App.vue 中移出的内容**
- `playingLocalId`
- `playRegionAudio()`
- `audioRef` 相关逻辑
- `regionAudioUrl()`
- `ttsUrl()`
- `googlePronunciationUrl()`
- `googlePronunciationWord()`

**收益**
- 单点播放和整页朗读分离
- audio 时序逻辑更清晰

---

### F. `usePageReading`
**职责**
- 全页朗读队列
- 顺序播放
- 暂停/恢复/停止
- 结束回调

**从 App.vue 中移出的内容**
- `pageReadingStatus`
- `pageReadingQueue`
- `pageReadingIndex`
- `playbackToken`
- `suppressAudioAbort`
- `startPageReading()`
- `stopPageReading()`
- `pausePageReading()`
- `resumePageReading()`
- `playPageReadingCurrent()`

**收益**
- 这是当前最脆弱、最值得独立出来的逻辑之一
- 独立后更容易做边界测试

---

### G. `useBookManager`
**职责**
- 书本创建
- 书本加载
- 书本删除
- 页面切换
- 当前页加载
- 未保存检测

**从 App.vue 中移出的内容**
- `currentBook`
- `bookPages`
- `currentPageIndex`
- `loadBook()`
- `deleteBook()`
- `deleteCurrentPage()`
- `loadCurrentPage()`
- `createBook()`
- `previousPage()`
- `nextPage()`
- `hasUnsavedChanges()`

**收益**
- 书本逻辑与单图逻辑分开
- 后续支持目录、排序、封面、批量管理会轻松很多

---

### H. `useHistoryManager`
**职责**
- 历史记录加载、删除、清空
- 书本列表维护
- drawer 可见性控制

**从 App.vue 中移出的内容**
- `historyVisible`
- `historyTab`
- `saveRecords`
- `books`
- `loadSaveRecords()`
- `loadBooks()`
- `openHistory()`
- `deleteRecord()`
- `deleteBook()` 中和列表同步相关部分

**收益**
- 历史管理独立
- 减少和主页面状态的混杂

---

## 4.3 `App.vue` 重构后的理想状态

重构完成后，`App.vue` 应该主要做这些事：

- 布局
- 组件组合
- 组合多个 composable
- 传递必要的 props / events
- 处理全局 UI 协调（如 drawer、dialog 显示）

**不应该再做的事：**

- 直接写大量 fetch 逻辑
- 直接写拖拽计算
- 直接写音频播放状态机
- 直接写书本页码切换细节
- 直接管理十几二十个 ref

---

## 4.4 推荐实施顺序

1. 先抽 `useRegionDragging`
2. 再抽 `useRegionStyles`
3. 再抽 `useSingleReading` / `usePageReading`
4. 再抽 `useRegionEditor`
5. 再抽 `useBookManager`
6. 最后抽 `useImageUpload` / `useHistoryManager`

**原因**
- 拖拽和样式最独立，风险最低
- 阅读逻辑最复杂，收益高但要谨慎
- 书本和上传依赖较多，放后面更稳

---

## 5. `server/index.ts` 重构方案

## 5.1 建议拆分结构

```
server/
  app.ts                 # Hono app 初始化
  index.ts               # 启动入口
  routes/
    health.ts
    images.ts
    regions.ts
    books.ts
    saveRecords.ts
    audio.ts
  services/
    imageService.ts
    regionService.ts
    bookService.ts
    saveRecordService.ts
    ocrService.ts
    ttsService.ts
  db/
    client.ts            # better-sqlite3 实例
    migrations.ts        # migrateDatabase()
    repositories/
      imageRepo.ts
      regionRepo.ts
      bookRepo.ts
      pageRepo.ts
      saveRecordRepo.ts
  utils/
    hash.ts
    text.ts
    mime.ts
```

---

## 5.2 推荐拆分模块

### A. `db/client.ts`
**职责**
- 创建并导出单例 `db`
- 设置 WAL
- 提供统一数据库入口

**收益**
- 避免多个模块各自 new Database
- 后续替换连接方式更容易

---

### B. `db/migrations.ts`
**职责**
- `migrateDatabase()`
- PRAGMA 检查
- ALTER TABLE
- 去重逻辑
- 唯一索引初始化

**收益**
- 数据库演进逻辑独立
- 不再和路由实现混在一起

---

### C. `db/repositories/*.ts`
**职责**
- 直接执行 SQL
- 返回结构化数据

**建议拆成：**
- `imageRepo`
- `regionRepo`
- `bookRepo`
- `pageRepo`
- `saveRecordRepo`

**收益**
- SQL 集中
- 路由和服务不再直接写 prepare / get / run
- 后续加缓存、批量操作更容易

---

### D. `services/*.ts`
**职责**
- 业务规则
- 参数校验后的处理
- 调用 repo / 外部接口
- 组合多个数据库操作

**建议拆成：**
- `imageService`：上传、复用、hash 去重
- `regionService`：增删改查、保存全部
- `bookService`：书本创建、页面追加、删除
- `saveRecordService`：保存记录管理
- `ocrService`：OCR 调用、结果解析
- `ttsService`：TTS URL、代理逻辑

**收益**
- 路由层只做协议转换
- 业务逻辑单独可测

---

### E. `routes/*.ts`
**职责**
- 解析请求
- 调用 service
- 返回 JSON / stream

**建议拆成：**
- `/api/health`
- `/api/images`
- `/api/images/:id/*`
- `/api/text-regions/:id/*`
- `/api/books`
- `/api/books/:id/*`
- `/api/save-records`
- `/api/tts`
- `/api/google-pronunciation`

**收益**
- 路由职责清晰
- 后续加版本号、鉴权、日志中间件更自然

---

### F. `app.ts`
**职责**
- 创建 Hono app
- 注册中间件
- 注册路由

**收益**
- `index.ts` 只负责启动
- 方便后面做测试和无端口启动

---

## 5.3 推荐实施顺序

1. 先抽 `db/client.ts`
2. 再抽 `db/migrations.ts`
3. 再把 SQL 访问逐步迁到 repositories
4. 再拆 `ocrService` / `ttsService`
5. 再按资源拆 routes
6. 最后抽 services

**原因**
- DB 和迁移最先独立，改动最稳
- OCR 是最不稳定的外部依赖，应该独立
- 路由最后整体会更顺

---

## 6. 重构过程中的注意事项

## 6.1 不要一次重写
优先小步重构：
- 一个模块一个模块抽
- 每次抽完保证页面还能跑
- 先保行为，再优化结构

## 6.2 保持 API 不变
第一轮重构建议：
- 不改 REST 接口
- 不改数据库表结构
- 只改内部代码组织

这样风险最低。

## 6.3 保留最小回归方式
即使暂不写自动化测试，也建议保留：
- 上传一张图
- OCR 或 JSON 导入
- 保存全部
- 书本翻页
- 单点播放
- 整页朗读

作为手工回归路径。

---

## 7. 重构完成后会获得什么

### 前端
- `App.vue` 明显变轻
- 编辑、阅读、书本三条主线分开
- 拖拽和音频逻辑可独立修改
- 更容易继续加功能

### 后端
- `server/index.ts` 不再是“巨型控制器”
- 数据访问和业务逻辑分开
- OCR / TTS 独立演进
- 更容易加日志、鉴权、缓存、测试

---

## 8. 结论

当前最值得重构的是：

- `src/App.vue`
- `server/index.ts`

正确做法不是“把代码挪小一点”，而是：

- 前端按业务能力拆 composables
- 后端按职责分 route / service / repository

这样项目才能从“能跑”升级到“好维护”。

