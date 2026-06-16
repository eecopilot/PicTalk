# 图片点读机开发 Todo

## 项目目标
实现一个图片点读机：用户上传图片，在图片文字区域创建可拖动输入框，保存文字与百分比坐标；阅读时点击文字区域，调用 TTS 接口并播放声音。

## 技术栈
- 前端：Vue 3、Element Plus、Vite。
- 后端：Hono.js。
- 数据库：SQLite。
- TTS：`https://tts.323686.xyz/tts`，固定参数为 `v=zh-CN-XiaoxiaoMultilingualNeural&r=0&p=0&o=audio-24khz-48kbitrate-mono-mp3`。

## 部署环境
- 本地 Ubuntu Server IP：`192.168.1.30`。
- Ubuntu Server 架构：`x86_64`（Docker 平台对应 `linux/amd64`）。
- OCR OpenAI 兼容接口：`http://192.168.1.30:8317`。
- Docker Compose 使用 `.env` 注入 `PORT`、`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OCR_MODEL`，不要把 key 硬编码到 compose 文件。
- SQLite 数据库无需初始化脚本；应用启动时会自动创建 `data/pic-reader.sqlite`、建表并执行兼容迁移。空的 `data/` 和 `public/uploads/` 目录可以直接启动。

## UI 约定
- 图片始终在主内容区域居中显示，并保持原始比例自适应缩放。
- 上传图片按钮固定在页面右上方。
- 工具栏固定在页面最底部。
- 文字标注使用百分比坐标，避免图片缩放后位置漂移。
- 编辑模式可创建、拖动、输入、保存和删除文字区域。
- 阅读模式点击文字区域播放 TTS 音频。

## API
- `POST /api/images`：上传图片。
- `GET /api/images/:id`：获取图片与文字标注。
- `POST /api/images/:id/text-regions`：新增文字区域。
- `PUT /api/text-regions/:id`：更新文字或坐标。
- `DELETE /api/text-regions/:id`：删除文字区域。
- `POST /api/text-regions/:id/audio`：返回该文字区域的 TTS 音频 URL。

## 数据模型
- `images`：图片 id、文件名、原始文件名、原始宽高、创建时间。
- `text_regions`：图片 id、文字内容、百分比坐标、百分比宽高、创建/更新时间。

## Todo 顺序
1. 初始化 Vue 3 + Element Plus 前端工程、Hono 后端服务、SQLite 目录结构。
2. 建立 `images` 和 `text_regions` 表。
3. 实现图片上传、文字区域 CRUD、TTS URL 生成接口。
4. 搭建前端主布局：居中图片、右上角上传按钮、底部工具栏。
5. 实现图片上传与预览。
6. 实现“生成文字”：点击图片生成可拖动 input。
7. 保存文字内容与百分比坐标到数据库。
8. 加载并回显已有文字区域，支持修改和删除。
9. 阅读模式点击文字区域播放 TTS 音频。
10. 验证刷新恢复、缩放定位、中文/英文/标点 URL encode 和窄屏布局。

## 当前实现状态
- 已搭建可运行的最小全栈项目。
- 已实现上传图片、居中预览、底部工具栏、文字标注 CRUD、百分比坐标保存和 TTS URL 播放。
- 初版不包含登录、权限、多项目管理、OCR 自动识别或音频缓存。
