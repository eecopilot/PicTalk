# PicTalk

## 这是什么
一个图片点读机：上传图片后，自动 OCR 识别图片里的文字并生成点读标注；人工只需要微调位置，阅读时点击喇叭就会播放声音。

一句话描述：PicTalk 让普通图片自动变成可以点击朗读的互动点读页面。

## 演示视频

https://github.com/eecopilot/PicTalk/blob/main/public/demo/pic-talk-ocr-demo.mp4

## 功能截图

效果
![PicTalk site](public/demo/site.png)

上传
![OCR upload](public/demo/ocr-upload.png)

可以人工编辑
![OCR edit](public/demo/ocr-edit.png)

点读
![OCR result](public/demo/ocr-result.png)

## 怎么跑
clone 仓库：

```bash
git clone git@github.com:eecopilot/PicTalk.git
cd PicTalk
```

安装依赖：

```bash
npm install
```

配置 OCR：

```bash
cp .env.example .env
```

`.env` 默认使用本地 OpenAI 兼容 OCR 接口：

```bash
PORT=8787
OPENAI_BASE_URL=http://192.168.1.30:8317
OPENAI_API_KEY=你的接口 key
OCR_MODEL=gemini-3.1-pro-preview
```

运行：

```bash
npm run dev
```

打开：

```text
http://localhost:5173/
```

后端默认运行在：

```text
http://localhost:8787/
```

Docker 部署：

```bash
cp .env.example .env
# 编辑 .env，填写 OPENAI_API_KEY
docker compose up -d --build
```

SQLite 数据库不需要提前创建。应用启动时会自动创建 `data/pic-reader.sqlite`，并自动建表/迁移；空目录也可以直接启动。上传图片保存在 `public/uploads`。Docker Compose 已把这两个目录挂载到宿主机，重建容器不会丢数据。

## 用了什么
- 本地 OpenAI 兼容 OCR API
- Vue 3
- Element Plus
- Hono.js
- SQLite
- TTS 接口：`https://tts.323686.xyz/tts`

主要功能：
- 上传图片并居中预览。
- OCR 自动识别图片文字，并生成可拖动喇叭标注。
- 人工可以微调喇叭位置，也可以手动补充遗漏文字。
- 保存文字、百分比坐标和图片数据到 SQLite。
- 重新打开图片时回显文字标注。
- 阅读模式下点击喇叭标注，调用 TTS 接口并播放音频。
- 保存历史支持回填、删除和清空。
