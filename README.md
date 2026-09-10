# Video Studio

一个可自行部署、与服务商无关的视频生成工作台。项目提供提示词编辑、参考素材、任务轮询、历史记录和结果预览，不内置任何上游地址、账号、密钥或厂商模型。

## 功能

- 通过环境变量连接一个兼容的异步视频生成 API
- 模型 ID 由使用者在界面中填写，不包含预设模型
- 支持图片、视频和音频 URL 或本地参考素材
- 任务状态自动轮询，网络失败时指数退避
- 任务历史和可选 API Key 仅保存在浏览器本地
- Node 同源代理避免浏览器直接暴露上游地址

## 启动

```bash
cp .env.example .env
npm install
npm run dev
```

默认访问地址为 `http://localhost:4173`。

Node 不会自动读取 `.env` 文件。可以在 shell 中导入变量，或使用部署平台提供的环境变量配置功能：

```bash
set -a
source .env
set +a
npm run dev
```

## 配置

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `4173` | 本地监听端口 |
| `VIDEO_API_BASE` | 无 | 必填，上游 API 根地址 |
| `VIDEO_TASKS_PATH` | `/v1/videos` | 创建和查询任务的路径 |
| `VIDEO_API_AUTH_HEADER` | `Authorization` | 上游鉴权请求头 |
| `VIDEO_API_AUTH_PREFIX` | `Bearer ` | API Key 前缀，可配置为空字符串 |

## 上游 API 契约

创建任务：

```http
POST {VIDEO_API_BASE}{VIDEO_TASKS_PATH}
```

请求体：

```json
{
  "model": "your-model-id",
  "prompt": "video description",
  "seconds": "10",
  "ratio": "16:9",
  "resolution": "720p",
  "generate_audio": true,
  "seed": -1,
  "input_reference": ["https://example.invalid/reference.png"]
}
```

查询任务：

```http
GET {VIDEO_API_BASE}{VIDEO_TASKS_PATH}/{task_id}
```

响应至少需要提供 `id` 或 `task_id`。状态支持 `queued`、`pending`、`processing`、`running`、`in_progress`、`completed`、`succeeded`、`failed` 和 `error`。结果地址可使用 `video_url`、`output_url` 或 `metadata.url`。

本地素材会转换为 `data:` URL 写入 `input_reference`。上游必须支持对应格式；大文件更适合使用可访问的 URL。

## 生产运行

```bash
npm run build
npm start
```

## 安全说明

- 仓库不包含上游地址、API Key 或个人配置。
- 浏览器提交的 Key 只用于当前代理请求，服务端不持久化也不记录。
- 勾选“记住”会把 Key 写入当前浏览器的 `localStorage`；不勾选则只写入 `sessionStorage`。
- 公开部署前应增加身份认证、访问控制、请求限流和可信代理配置。

## License

[MIT](LICENSE)
