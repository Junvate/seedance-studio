import type {
  GenerateOptions,
  NormalizedVideoResponse,
  ReferenceItem,
  VideoApiResponse,
  VideoStatus,
} from "../types";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function referenceToUrl(reference: ReferenceItem) {
  const url = reference.file ? await fileToDataUrl(reference.file) : reference.url;
  if (!url) throw new Error(`素材 ${reference.name} 没有可用地址`);
  return url;
}

export async function buildPayload(
  options: GenerateOptions,
  onPrepareProgress?: (completed: number, total: number) => void,
) {
  const payload: Record<string, unknown> = {
    model: options.model,
    prompt: options.prompt,
    seconds: String(options.seconds),
    ratio: options.ratio,
    resolution: options.resolution,
    generate_audio: options.generateAudio,
    seed: options.seed,
  };

  if (options.references.length > 0) {
    let completed = 0;
    payload.input_reference = await Promise.all(options.references.map(async (reference) => {
      const url = await referenceToUrl(reference);
      completed += 1;
      onPrepareProgress?.(completed, options.references.length);
      return url;
    }));
  }

  return payload;
}

function readError(body: unknown, fallback: string) {
  if (body && typeof body === "object") {
    const value = body as {
      code?: string | number;
      error?: { code?: string; message?: string } | string;
      message?: string;
      msg?: string;
    };
    const structuredError = typeof value.error === "object" ? value.error : undefined;
    return {
      message: structuredError?.message
        || (typeof value.error === "string" ? value.error : undefined)
        || value.message
        || value.msg
        || fallback,
      code: structuredError?.code || (value.code == null ? undefined : String(value.code)),
    };
  }
  return { message: fallback };
}

function normalizeStatus(value?: string): VideoStatus {
  const status = value?.toLowerCase();
  if (["completed", "succeeded", "success", "done"].includes(status || "")) return "completed";
  if (["failed", "error", "cancelled", "canceled"].includes(status || "")) return "failed";
  if (["processing", "running", "in_progress", "generating"].includes(status || "")) return "in_progress";
  return "queued";
}

function epochMilliseconds(value: unknown) {
  if (typeof value === "number") return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value !== "string") return undefined;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

function normalizeResponse(body: VideoApiResponse): NormalizedVideoResponse {
  const status = normalizeStatus(body.status);
  const error = typeof body.error === "string" ? body.error : body.error?.message;
  return {
    id: String(body.task_id || body.id || ""),
    status,
    progress: typeof body.progress === "number" ? body.progress : status === "completed" ? 100 : 0,
    videoUrl: body.video_url || body.output_url || body.metadata?.url,
    createdAt: epochMilliseconds(body.created_at),
    completedAt: epochMilliseconds(body.completed_at),
    error,
  };
}

export function submitVideo(
  payload: Record<string, unknown>,
  apiKey: string,
  onProgress: (progress: number) => void,
) {
  return new Promise<NormalizedVideoResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos");
    xhr.setRequestHeader("content-type", "application/json");
    xhr.setRequestHeader("x-api-key", apiKey);
    xhr.timeout = 300_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError("提交连接中断，请先检查任务记录，避免重复提交", 0));
    xhr.ontimeout = () => reject(new ApiError("提交响应超时，请先检查任务记录，避免重复提交", 0));
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(normalizeResponse((body || {}) as VideoApiResponse));
      } else {
        const error = readError(body, `提交失败（HTTP ${xhr.status}）`);
        reject(new ApiError(error.message, xhr.status, error.code));
      }
    };
    xhr.send(JSON.stringify(payload));
  });
}

export async function getVideo(id: string, apiKey: string) {
  const response = await fetch(`/api/videos/${encodeURIComponent(id)}`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    cache: "no-store",
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = readError(body, `轮询失败（HTTP ${response.status}）`);
    throw new ApiError(error.message, response.status, error.code);
  }
  return normalizeResponse((body || {}) as VideoApiResponse);
}
