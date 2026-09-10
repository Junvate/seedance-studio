import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4173);
const upstreamBase = (process.env.VIDEO_API_BASE || "").replace(/\/$/, "");
const tasksPath = normalizePath(process.env.VIDEO_TASKS_PATH || "/v1/videos");
const authHeader = process.env.VIDEO_API_AUTH_HEADER || "Authorization";
const authPrefix = process.env.VIDEO_API_AUTH_PREFIX ?? "Bearer ";

function normalizePath(value) {
  const pathValue = value.trim();
  if (!pathValue.startsWith("/") || pathValue.includes("..") || pathValue.includes("?")) {
    throw new Error("VIDEO_TASKS_PATH must be an absolute URL path without query parameters");
  }
  return pathValue.replace(/\/$/, "");
}

app.disable("x-powered-by");
app.use("/api/videos", express.raw({ type: ["application/json", "application/*+json"], limit: "300mb" }));

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store").json({ ok: true, upstreamConfigured: Boolean(upstreamBase) });
});

async function proxyUpstream(req, res, tail = []) {
  if (!upstreamBase) {
    return res.status(503).json({
      error: { code: "upstream_not_configured", message: "服务端尚未配置 VIDEO_API_BASE" },
    });
  }

  const apiKey = req.get("x-api-key")?.trim();
  if (!apiKey) {
    return res.status(401).json({
      error: { code: "missing_api_key", message: "请先在设置中填写 API Key" },
    });
  }

  const suffix = tail.length ? `/${tail.map(encodeURIComponent).join("/")}` : "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.method === "POST" ? 300_000 : 45_000);

  try {
    const headers = {
      [authHeader]: `${authPrefix}${apiKey}`,
      accept: req.get("accept") || "application/json",
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      headers["content-type"] = req.get("content-type") || "application/json";
    }

    const response = await fetch(`${upstreamBase}${tasksPath}${suffix}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
      signal: controller.signal,
    });

    res.status(response.status);
    const contentType = response.headers.get("content-type");
    const location = response.headers.get("location");
    const retryAfter = response.headers.get("retry-after");
    if (contentType) res.set("content-type", contentType);
    if (location) res.set("location", location);
    if (retryAfter) res.set("retry-after", retryAfter);
    res.set("Cache-Control", "no-store");
    return res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      error: {
        code: timedOut ? "upstream_timeout" : "upstream_unavailable",
        message: timedOut ? "上游响应超时，请确认任务状态后再操作" : "暂时无法连接上游服务",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

app.post("/api/videos", (req, res) => proxyUpstream(req, res));
app.get("/api/videos/:id", (req, res) => proxyUpstream(req, res, [req.params.id]));

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.listen(port, "0.0.0.0", (error) => {
  if (error) {
    console.error(`Video Studio failed to start: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Video Studio: http://localhost:${port}`);
});
