import type { VideoJob } from "../types";

const JOBS_KEY = "open-video-studio.jobs.v1";
const LOCAL_KEY = "open-video-studio.api-key";
const SESSION_KEY = "open-video-studio.session-api-key";
const MODEL_KEY = "open-video-studio.model.v1";

export function loadJobs(): VideoJob[] {
  try {
    const value = JSON.parse(localStorage.getItem(JOBS_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function saveJobs(jobs: VideoJob[]) {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.slice(0, 50)));
}

export function loadApiKey() {
  return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(LOCAL_KEY) || "";
}

export function isApiKeyRemembered() {
  return Boolean(localStorage.getItem(LOCAL_KEY));
}

export function saveApiKey(apiKey: string, remember: boolean) {
  sessionStorage.setItem(SESSION_KEY, apiKey);
  if (remember) localStorage.setItem(LOCAL_KEY, apiKey);
  else localStorage.removeItem(LOCAL_KEY);
}

export function clearApiKey() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_KEY);
}

export function loadModel() {
  return localStorage.getItem(MODEL_KEY) || "";
}

export function saveModel(model: string) {
  localStorage.setItem(MODEL_KEY, model);
}
