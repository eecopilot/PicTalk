# PicTalk

## 这是什么
一个图片点读机：上传图片后，自动 OCR 识别图片里的文字并生成点读标注；人工只需要微调位置，阅读时点击喇叭就会播放声音。

一句话描述：PicTalk 让普通图片自动变成可以点击朗读的互动点读页面。

## 演示视频

https://github.com/eecopilot/PicTalk/blob/main/public/demo/pic-talk-ocr-demo.mp4

## 功能截图

![PicTalk site](public/demo/site.png)

![OCR upload](public/demo/ocr-upload.png)

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

在 `.env` 中填写 OpenAI 兼容接口 key：

```bash
OPENAI_BASE_URL=https://unity2.ai
OPENAI_API_KEY=xxx
OCR_MODEL=gpt-5.5
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

## 用了什么
- Unity2.ai API（GPT-5.5）
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
