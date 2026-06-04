# PicTalk

## 这是什么
一个图片点读机：上传图片后，可以给图片中的文字位置添加可拖动标注；阅读时点击标注文字，就会调用 TTS 接口播放声音。

一句话描述：PicTalk 让普通图片变成可以点击朗读的互动点读页面。

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

配置 Unity2.ai API key：

```bash
cp .env.example .env
```

然后在 `.env` 文件中填写：

```bash
UNITY2_API_KEY=xxx
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
- 点击生成可拖动文字输入框。
- 保存文字、百分比坐标和图片数据到 SQLite。
- 重新打开图片时回显文字标注。
- 阅读模式下点击文字标注，调用 TTS 接口并播放音频。
