export type VideoStatus = "queued" | "in_progress" | "completed" | "failed";
export type ReferenceKind = "image" | "video" | "audio";
export type VideoResolution = "480p" | "720p" | "1080p" | "4k";

export interface ReferenceItem {
  id: string;
  kind: ReferenceKind;
  source: "file" | "url";
  name: string;
  url?: string;
  file?: File;
  previewUrl?: string;
  size?: number;
}

export interface VideoJob {
  id: string;
  model: string;
  status: VideoStatus;
  progress: number;
  prompt: string;
  seconds: number;
  ratio: string;
  resolution: string;
  generateAudio: boolean;
  createdAt: number;
  completedAt?: number;
  videoUrl?: string;
  error?: string;
  transientError?: string;
  nextPollAt?: number;
}

export interface VideoApiResponse {
  id?: string;
  task_id?: string;
  status?: string;
  progress?: number;
  video_url?: string;
  output_url?: string;
  metadata?: { url?: string };
  created_at?: number | string;
  completed_at?: number | string;
  error?: { code?: string; message?: string } | string;
}

export interface NormalizedVideoResponse {
  id: string;
  status: VideoStatus;
  progress: number;
  videoUrl?: string;
  createdAt?: number;
  completedAt?: number;
  error?: string;
}

export interface GenerateOptions {
  model: string;
  prompt: string;
  seconds: number;
  ratio: string;
  resolution: VideoResolution;
  generateAudio: boolean;
  seed: number;
  references: ReferenceItem[];
}
