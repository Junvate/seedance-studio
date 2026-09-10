import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ChevronDown,
  CirclePlay,
  Clock3,
  Copy,
  ExternalLink,
  FileAudio,
  FileImage,
  FileVideo,
  Film,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  UploadCloud,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, buildPayload, getVideo, submitVideo } from "./lib/api";
import { diagnoseGenerationError } from "./lib/errors";
import {
  clearApiKey,
  isApiKeyRemembered,
  loadApiKey,
  loadJobs,
  loadModel,
  saveApiKey,
  saveJobs,
  saveModel,
} from "./lib/storage";
import type {
  GenerateOptions,
  ReferenceItem,
  ReferenceKind,
  VideoJob,
  VideoResolution,
  VideoStatus,
} from "./types";

const RATIOS = ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const RESOLUTIONS: VideoResolution[] = ["480p", "720p", "1080p", "4k"];
const MAX_COUNTS: Record<ReferenceKind, number> = { image: 30, video: 10, audio: 10 };
const MAX_TOTAL_BYTES = 180 * 1024 * 1024;
const POLL_INTERVAL = 5_000;

const STATUS_LABEL: Record<VideoStatus, string> = {
  queued: "排队中",
  in_progress: "生成中",
  completed: "已完成",
  failed: "失败",
};

function formatBytes(value = 0) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function inferKind(file: File): ReferenceKind | null {
  const prefix = file.type.split("/")[0];
  if (prefix === "image" || prefix === "video" || prefix === "audio") return prefix;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(extension || "")) return "image";
  if (["mp4", "mov", "webm", "m4v"].includes(extension || "")) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg"].includes(extension || "")) return "audio";
  return null;
}

function referenceIcon(kind: ReferenceKind) {
  if (kind === "image") return FileImage;
  if (kind === "video") return FileVideo;
  return FileAudio;
}

interface SettingsDialogProps {
  open: boolean;
  apiKey: string;
  remembered: boolean;
  onClose: () => void;
  onSave: (key: string, remember: boolean) => void;
  onClear: () => void;
}

function SettingsDialog({ open, apiKey, remembered, onClose, onSave, onClear }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draftKey, setDraftKey] = useState(apiKey);
  const [remember, setRemember] = useState(remembered);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setDraftKey(apiKey);
      setRemember(remembered);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, apiKey, remembered]);

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="settings-sheet"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draftKey.trim(), remember);
        }}
      >
        <div className="dialog-header">
          <div>
            <span className="eyebrow">CONNECTION</span>
            <h2>服务连接</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭设置" title="关闭">
            <X size={18} />
          </button>
        </div>

        <label className="field-group" htmlFor="service-key">
          <span className="field-label">API Key</span>
          <input
            id="service-key"
            type="password"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="输入服务密钥"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="check-row" htmlFor="remember-key">
          <input
            id="remember-key"
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span className="check-box" aria-hidden="true"><Check size={13} /></span>
          <span>在此浏览器中记住 Key</span>
        </label>

        <p className="privacy-note">Key 仅通过本机同源代理转发，不会写入服务端文件或日志。</p>

        <div className="dialog-actions">
          {apiKey && (
            <button type="button" className="button ghost danger" onClick={onClear}>断开</button>
          )}
          <button type="submit" className="button primary" disabled={!draftKey.trim()}>
            <Check size={17} /> 保存连接
          </button>
        </div>
      </form>
    </dialog>
  );
}

function ReferenceList({ references, onRemove }: { references: ReferenceItem[]; onRemove: (id: string) => void }) {
  if (references.length === 0) return null;
  return (
    <div className="reference-list">
      {references.map((reference) => {
        const Icon = referenceIcon(reference.kind);
        return (
          <div className="reference-item" key={reference.id}>
            <div className={`reference-thumb ${reference.kind}`}>
              {reference.kind === "image" && reference.previewUrl
                ? <img src={reference.previewUrl} alt="" />
                : <Icon size={17} aria-hidden="true" />}
            </div>
            <div className="reference-meta">
              <span title={reference.name}>{reference.name}</span>
              <small>{reference.source === "file" ? formatBytes(reference.size) : reference.kind.toUpperCase()}</small>
            </div>
            <button
              type="button"
              className="icon-button subtle"
              onClick={() => onRemove(reference.id)}
              aria-label={`移除 ${reference.name}`}
              title="移除素材"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface JobCardProps {
  job: VideoJob;
  selected: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  onReuse: () => void;
}

function JobCard({ job, selected, onSelect, onRefresh, onReuse }: JobCardProps) {
  return (
    <article className={`job-card ${selected ? "selected" : ""}`}>
      <button type="button" className="job-main" onClick={onSelect} aria-pressed={selected}>
        <div className="job-topline">
          <span className={`status-pill ${job.status}`}>
            {job.status === "in_progress" && <LoaderCircle size={12} className="spin" />}
            {STATUS_LABEL[job.status]}
            {(job.status === "queued" || job.status === "in_progress") && ` ${job.progress}%`}
          </span>
          <time>{formatDate(job.createdAt)}</time>
        </div>
        <p>{job.prompt}</p>
        <div className="job-specs">
          <span title={job.model}>{job.model}</span>
          <span>{job.ratio}</span>
          <span>{job.resolution}</span>
          <span>{job.seconds}s</span>
        </div>
        {(job.status === "queued" || job.status === "in_progress") && (
          <div className="mini-progress" aria-label={`生成进度 ${job.progress}%`}>
            <span style={{ width: `${job.progress}%` }} />
          </div>
        )}
      </button>
      <div className="job-actions">
        <button type="button" className="icon-button subtle" onClick={onRefresh} title="立即刷新" aria-label="立即刷新">
          <RefreshCw size={14} />
        </button>
        <button type="button" className="icon-button subtle" onClick={onReuse} title="复用参数" aria-label="复用参数">
          <RotateCcw size={14} />
        </button>
      </div>
    </article>
  );
}

function FailedJobState({ job, onReuse, onCopyError }: { job: VideoJob; onReuse: () => void; onCopyError: () => void }) {
  const diagnosis = diagnoseGenerationError(job.error);
  return (
    <div className="failed-state">
      <div className="failed-icon"><AlertCircle size={28} /></div>
      {diagnosis.code && <span className="error-code-badge">UPSTREAM {diagnosis.code}</span>}
      <h3>{diagnosis.title}</h3>
      <p>{diagnosis.detail}</p>
      {job.error && <code className="original-error">{job.error}</code>}
      <div className="failed-actions">
        <button type="button" className="button secondary" onClick={onCopyError}><Copy size={16} /> 复制错误</button>
        {diagnosis.retryable && (
          <button type="button" className="button secondary" onClick={onReuse}><RotateCcw size={16} /> 复用参数</button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const initialJobs = useMemo(() => loadJobs(), []);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [remembered, setRemembered] = useState(isApiKeyRemembered);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [model, setModel] = useState(loadModel);
  const [prompt, setPrompt] = useState("");
  const [seconds, setSeconds] = useState(10);
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState<VideoResolution>("720p");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [seed, setSeed] = useState(-1);
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [urlMode, setUrlMode] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceKind, setReferenceKind] = useState<ReferenceKind>("image");
  const [dragging, setDragging] = useState(false);
  const [jobs, setJobs] = useState<VideoJob[]>(initialJobs);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobs[0]?.id || null);
  const [notice, setNotice] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitStage, setSubmitStage] = useState("准备任务");
  const pollingRef = useRef(new Set<string>());
  const failuresRef = useRef(new Map<string, number>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveJobs(jobs), [jobs]);
  useEffect(() => saveModel(model.trim()), [model]);

  useEffect(() => {
    if (!notice || notice.type === "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedId) || jobs[0] || null,
    [jobs, selectedId],
  );
  const activeCount = jobs.filter((job) => job.status === "queued" || job.status === "in_progress").length;

  const pollJob = useCallback(async (id: string, force = false) => {
    const current = jobs.find((job) => job.id === id);
    if (!current || (!force && !["queued", "in_progress"].includes(current.status))) return;
    if (!apiKey || pollingRef.current.has(id)) return;
    if (!force && current.nextPollAt && current.nextPollAt > Date.now()) return;

    pollingRef.current.add(id);
    try {
      const result = await getVideo(id, apiKey);
      failuresRef.current.delete(id);
      setJobs((items) => items.map((job) => job.id === id ? {
        ...job,
        status: result.status,
        progress: result.progress,
        videoUrl: result.videoUrl || job.videoUrl,
        completedAt: result.completedAt || job.completedAt,
        error: result.error,
        transientError: undefined,
        nextPollAt: result.status === "queued" || result.status === "in_progress"
          ? Date.now() + POLL_INTERVAL
          : undefined,
      } : job));
    } catch (error) {
      const failureCount = (failuresRef.current.get(id) || 0) + 1;
      failuresRef.current.set(id, failureCount);
      const delay = Math.min(60_000, POLL_INTERVAL * 2 ** Math.min(failureCount - 1, 3));
      setJobs((items) => items.map((job) => job.id === id ? {
        ...job,
        transientError: error instanceof Error ? error.message : "轮询连接中断",
        nextPollAt: Date.now() + delay,
      } : job));
    } finally {
      pollingRef.current.delete(id);
    }
  }, [apiKey, jobs]);

  useEffect(() => {
    const tick = () => {
      for (const job of jobs) {
        if (apiKey
          && (job.status === "queued" || job.status === "in_progress")
          && (!job.nextPollAt || job.nextPollAt <= Date.now())) {
          void pollJob(job.id);
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, 1_000);
    const resume = () => setJobs((items) => items.map((job) => (
      job.status === "queued" || job.status === "in_progress" ? { ...job, nextPollAt: Date.now() } : job
    )));
    window.addEventListener("online", resume);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", resume);
    };
  }, [apiKey, jobs, pollJob]);

  function addFiles(files: File[]) {
    const accepted: ReferenceItem[] = [];
    const counts = references.reduce<Record<ReferenceKind, number>>(
      (result, item) => ({ ...result, [item.kind]: result[item.kind] + 1 }),
      { image: 0, video: 0, audio: 0 },
    );
    let totalBytes = references.reduce((sum, item) => sum + (item.size || 0), 0);

    for (const file of files) {
      const kind = inferKind(file);
      if (!kind) {
        setNotice({ type: "error", message: `${file.name} 不是支持的图片、视频或音频` });
        continue;
      }
      if (counts[kind] >= MAX_COUNTS[kind]) {
        setNotice({ type: "error", message: "该类型素材已达数量上限" });
        continue;
      }
      if (totalBytes + file.size > MAX_TOTAL_BYTES) {
        setNotice({ type: "error", message: "本地素材总大小不能超过 180 MB" });
        break;
      }
      counts[kind] += 1;
      totalBytes += file.size;
      accepted.push({
        id: crypto.randomUUID(),
        kind,
        source: "file",
        name: file.name,
        file,
        size: file.size,
        previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
      });
    }
    if (accepted.length) setReferences((items) => [...items, ...accepted]);
  }

  function addUrlReference() {
    const value = referenceUrl.trim();
    try {
      const parsed = new URL(value);
      if (!["http:", "https:", "data:"].includes(parsed.protocol)) throw new Error();
    } catch {
      setNotice({ type: "error", message: "请输入有效的 http(s) 或 data: 地址" });
      return;
    }
    if (references.filter((item) => item.kind === referenceKind).length >= MAX_COUNTS[referenceKind]) {
      setNotice({ type: "error", message: "该类型素材已达数量上限" });
      return;
    }
    let displayName = value.slice(0, 48);
    try {
      const parsed = new URL(value);
      displayName = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname || displayName;
    } catch {
      // Data URLs do not expose a useful filename.
    }
    setReferences((items) => [...items, {
      id: crypto.randomUUID(),
      kind: referenceKind,
      source: "url",
      name: displayName,
      url: value,
    }]);
    setReferenceUrl("");
  }

  function removeReference(id: string) {
    setReferences((items) => {
      const removed = items.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return items.filter((item) => item.id !== id);
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }
    if (!model.trim()) {
      setNotice({ type: "error", message: "请填写模型 ID" });
      return;
    }
    if (!prompt.trim()) {
      setNotice({ type: "error", message: "请填写视频提示词" });
      return;
    }

    const options: GenerateOptions = {
      model: model.trim(),
      prompt: prompt.trim(),
      seconds,
      ratio,
      resolution,
      generateAudio,
      seed,
      references,
    };

    setSubmitting(true);
    setSubmitProgress(0);
    setSubmitStage(references.some((item) => item.file) ? "准备本地素材" : "提交任务");
    try {
      const payload = await buildPayload(options, (completed, total) => {
        setSubmitProgress(Math.round((completed / total) * 20));
      });
      if (references.length === 0) setSubmitProgress(20);
      setSubmitStage("稳定上传中");
      const result = await submitVideo(payload, apiKey, (progress) => {
        setSubmitProgress(20 + Math.round(progress * 0.8));
      });
      if (!result.id) throw new ApiError(result.error || "服务未返回任务 ID", 502);

      const job: VideoJob = {
        id: result.id,
        model: options.model,
        status: result.status,
        progress: result.progress,
        prompt: options.prompt,
        seconds: options.seconds,
        ratio,
        resolution,
        generateAudio,
        createdAt: result.createdAt || Date.now(),
        completedAt: result.completedAt,
        videoUrl: result.videoUrl,
        error: result.error,
        nextPollAt: result.status === "completed" || result.status === "failed" ? undefined : Date.now() + POLL_INTERVAL,
      };
      setJobs((items) => [job, ...items.filter((item) => item.id !== job.id)]);
      setSelectedId(job.id);
      setSubmitProgress(100);
      setNotice({
        type: result.status === "failed" ? "error" : "success",
        message: result.status === "failed" ? job.error || "任务提交后立即失败" : `任务已提交：${job.id}`,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "任务提交失败";
      const diagnosis = diagnoseGenerationError(rawMessage);
      setNotice({ type: "error", message: diagnosis.code ? diagnosis.detail : rawMessage });
    } finally {
      setSubmitting(false);
      setSubmitStage("准备任务");
    }
  }

  function reuseJob(job: VideoJob) {
    setPrompt(job.prompt);
    setSeconds(job.seconds);
    setRatio(job.ratio);
    setModel(job.model);
    setResolution(job.resolution as VideoResolution);
    setGenerateAudio(job.generateAudio);
    document.querySelector(".composer-pane")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copyJobId() {
    if (!selectedJob) return;
    void navigator.clipboard.writeText(selectedJob.id).then(() => {
      setNotice({ type: "success", message: "任务 ID 已复制" });
    }).catch(() => setNotice({ type: "error", message: "当前浏览器不允许访问剪贴板" }));
  }

  function copySelectedError() {
    if (!selectedJob?.error) return;
    void navigator.clipboard.writeText(selectedJob.error).then(() => {
      setNotice({ type: "success", message: "错误信息已复制" });
    }).catch(() => setNotice({ type: "error", message: "当前浏览器不允许访问剪贴板" }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Film size={19} strokeWidth={2.2} /></div>
          <div><strong>VIDEO</strong><span>STUDIO</span></div>
        </div>
        <div className="topbar-actions">
          <div className={`connection-state ${apiKey ? "connected" : ""}`}>
            <span className="connection-dot" />
            <span>{apiKey ? "服务已连接" : "服务待连接"}</span>
          </div>
          {activeCount > 0 && <span className="active-jobs"><LoaderCircle size={13} className="spin" /> {activeCount} 个任务</span>}
          <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="服务设置" title="服务设置">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="composer-pane">
          <form onSubmit={handleSubmit}>
            <div className="pane-heading">
              <div><span className="eyebrow">CREATE</span><h1>新建视频</h1></div>
              <span className="model-badge">OPEN SOURCE</span>
            </div>

            <section className="form-section prompt-section">
              <label className="field-label" htmlFor="video-model">模型 ID</label>
              <input
                id="video-model"
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="由上游服务提供"
                autoComplete="off"
                spellCheck={false}
              />
            </section>

            <section className="form-section">
              <label className="field-label" htmlFor="prompt">提示词</label>
              <div className="textarea-wrap">
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="描述画面、主体动作、镜头运动、光线和声音..."
                  maxLength={6000}
                />
                <span className="char-count">{prompt.length}</span>
              </div>
            </section>

            <section className="form-section">
              <div className="section-title-row">
                <span className="field-label">参考素材</span>
                <span className="section-count">{references.length}</span>
              </div>
              <div
                className={`drop-zone ${dragging ? "dragging" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*,video/*,audio/*"
                  multiple
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files || []));
                    event.target.value = "";
                  }}
                />
                <button type="button" className="drop-action" onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud size={19} /><span>添加本地素材</span>
                </button>
                <span className="drop-or">或</span>
                <button type="button" className="text-action" onClick={() => setUrlMode((value) => !value)}>
                  <Plus size={15} /> URL
                </button>
              </div>

              {urlMode && (
                <div className="url-editor">
                  <div className="compact-segment" aria-label="素材类型">
                    {(["image", "video", "audio"] as ReferenceKind[]).map((kind) => (
                      <button
                        type="button"
                        key={kind}
                        className={referenceKind === kind ? "active" : ""}
                        onClick={() => setReferenceKind(kind)}
                      >
                        {kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"}
                      </button>
                    ))}
                  </div>
                  <div className="url-input-row">
                    <input
                      type="url"
                      value={referenceUrl}
                      onChange={(event) => setReferenceUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addUrlReference();
                        }
                      }}
                      placeholder="https://..."
                      aria-label="参考素材 URL"
                    />
                    <button type="button" className="icon-button filled" onClick={addUrlReference} aria-label="添加 URL" title="添加 URL">
                      <Plus size={17} />
                    </button>
                  </div>
                </div>
              )}
              <ReferenceList references={references} onRemove={removeReference} />
            </section>

            <section className="form-section">
              <label className="field-label">画面比例</label>
              <div className="ratio-grid">
                {RATIOS.map((value) => (
                  <button type="button" key={value} className={ratio === value ? "active" : ""} onClick={() => setRatio(value)} aria-pressed={ratio === value}>
                    <span className={`ratio-icon ratio-${value.replace(":", "-")}`} />
                    {value === "auto" ? "自动" : value}
                  </button>
                ))}
              </div>
            </section>

            <section className="form-section two-column-section">
              <div>
                <label className="field-label">清晰度</label>
                <div className="segment-control">
                  {RESOLUTIONS.map((value) => (
                    <button type="button" key={value} className={resolution === value ? "active" : ""} onClick={() => setResolution(value)}>
                      {value === "4k" ? "4K" : value}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="seconds">时长 <strong>{seconds}s</strong></label>
                <input id="seconds" className="range-input" type="range" min="4" max="30" step="1" value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} />
              </div>
            </section>

            <section className="form-section option-row">
              <div className="option-copy">
                {generateAudio ? <Volume2 size={18} /> : <VolumeX size={18} />}
                <div><strong>生成音频</strong><span>{generateAudio ? "画面与声音同步" : "仅生成画面"}</span></div>
              </div>
              <button type="button" role="switch" aria-label="生成音频" aria-checked={generateAudio} className={`switch ${generateAudio ? "on" : ""}`} onClick={() => setGenerateAudio((value) => !value)}><span /></button>
            </section>

            <details className="advanced-settings">
              <summary><ChevronDown size={15} /> 高级设置</summary>
              <label className="field-group" htmlFor="seed">
                <span className="field-label">随机种子</span>
                <input id="seed" type="number" min="-1" value={seed} onChange={(event) => setSeed(Number(event.target.value))} />
              </label>
            </details>

            {notice && (
              <div className={`notice ${notice.type}`} role="alert">
                {notice.type === "error" ? <AlertCircle size={16} /> : <Check size={16} />}
                <span>{notice.message}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="关闭提示"><X size={14} /></button>
              </div>
            )}

            <button type="submit" className="generate-button" disabled={submitting || !prompt.trim()}>
              {submitting ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
              <span>{submitting ? submitStage : "生成视频"}</span>
              {submitting && <strong>{submitProgress}%</strong>}
            </button>
            {submitting && (
              <div className="submit-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={submitProgress}>
                <span style={{ width: `${submitProgress}%` }} />
              </div>
            )}
          </form>
        </aside>

        <div className="studio-workspace">
          <section className="preview-pane">
            <div className="preview-toolbar">
              <div><span className="eyebrow">OUTPUT</span><h2>{selectedJob ? "视频预览" : "等待创作"}</h2></div>
              {selectedJob && (
                <div className="preview-actions">
                  <button type="button" className="icon-button" onClick={copyJobId} title="复制任务 ID" aria-label="复制任务 ID"><Copy size={16} /></button>
                  {selectedJob.videoUrl && (
                    <>
                      <a className="icon-button" href={selectedJob.videoUrl} target="_blank" rel="noreferrer" title="新窗口打开" aria-label="新窗口打开"><ExternalLink size={16} /></a>
                      <a className="button compact" href={selectedJob.videoUrl} download target="_blank" rel="noreferrer"><ArrowDownToLine size={16} /> 下载</a>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={`preview-stage ${selectedJob?.status || "empty"}`}>
              {!selectedJob && (
                <div className="empty-state">
                  <div className="empty-visual" aria-hidden="true"><span className="frame back" /><span className="frame front"><CirclePlay size={36} /></span></div>
                  <h3>下一帧，从这里开始</h3>
                  <p>完成设置后，生成结果会出现在这里。</p>
                </div>
              )}

              {selectedJob?.status === "completed" && selectedJob.videoUrl && (
                <video src={selectedJob.videoUrl} controls playsInline preload="metadata" />
              )}

              {selectedJob && (selectedJob.status === "queued" || selectedJob.status === "in_progress") && (
                <div className="processing-state">
                  <div className="progress-dial" style={{ "--progress": `${selectedJob.progress * 3.6}deg` } as React.CSSProperties}>
                    <div><span>{selectedJob.progress}</span><small>%</small></div>
                  </div>
                  <h3>{selectedJob.status === "queued" ? "正在等待算力" : "正在生成画面"}</h3>
                  <p>{selectedJob.transientError || "任务已记录，可稍后返回查看。"}</p>
                  <div className="processing-specs">
                    <span title={selectedJob.model}>{selectedJob.model}</span>
                    <span><Clock3 size={14} /> {selectedJob.seconds} 秒</span>
                    <span>{selectedJob.ratio}</span>
                    <span>{selectedJob.resolution}</span>
                  </div>
                </div>
              )}

              {selectedJob?.status === "failed" && (
                <FailedJobState job={selectedJob} onReuse={() => reuseJob(selectedJob)} onCopyError={copySelectedError} />
              )}
            </div>

            {selectedJob && (
              <div className="output-meta">
                <div className="output-title"><span className={`status-dot ${selectedJob.status}`} /><p>{selectedJob.prompt}</p></div>
                <div className="output-id"><span>ID</span><code>{selectedJob.id}</code></div>
              </div>
            )}
          </section>

          <aside className="queue-pane">
            <div className="queue-header">
              <div><span className="eyebrow">QUEUE</span><h2>任务记录 <span>{jobs.length}</span></h2></div>
              {jobs.some((job) => job.status === "completed" || job.status === "failed") && (
                <button
                  type="button"
                  className="icon-button subtle"
                  onClick={() => {
                    const remaining = jobs.filter((job) => job.status === "queued" || job.status === "in_progress");
                    setJobs(remaining);
                    setSelectedId(remaining[0]?.id || null);
                  }}
                  title="清理已结束任务"
                  aria-label="清理已结束任务"
                ><Trash2 size={16} /></button>
              )}
            </div>
            <div className="queue-list">
              {jobs.length === 0 ? (
                <div className="queue-empty"><Film size={21} /><span>暂无任务</span></div>
              ) : jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selectedJob?.id === job.id}
                  onSelect={() => setSelectedId(job.id)}
                  onRefresh={() => {
                    if (!apiKey) setSettingsOpen(true);
                    else void pollJob(job.id, true);
                  }}
                  onReuse={() => reuseJob(job)}
                />
              ))}
            </div>
          </aside>
        </div>
      </main>

      <SettingsDialog
        open={settingsOpen}
        apiKey={apiKey}
        remembered={remembered}
        onClose={() => setSettingsOpen(false)}
        onSave={(key, remember) => {
          saveApiKey(key, remember);
          setApiKey(key);
          setRemembered(remember);
          setSettingsOpen(false);
          setNotice({ type: "success", message: "服务连接已保存" });
        }}
        onClear={() => {
          clearApiKey();
          setApiKey("");
          setRemembered(false);
          setSettingsOpen(false);
        }}
      />
    </div>
  );
}
