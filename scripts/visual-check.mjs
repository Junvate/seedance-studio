import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
let submittedPayload;

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.route("**/api/videos", async (route) => {
  if (route.request().method() !== "POST") return route.continue();
  submittedPayload = route.request().postDataJSON();
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "video_ui_check_001",
      status: "queued",
      progress: 0,
      created_at: Math.floor(Date.now() / 1000),
    }),
  });
});

await page.route("**/api/videos/video_ui_check_001", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "video_ui_check_001",
      status: "processing",
      progress: 36,
    }),
  });
});

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAcsW42QAAAAASUVORK5CYII=",
  "base64",
);

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "服务设置" }).click();
await page.getByLabel("API Key").fill("test-key-for-ui-check");
await page.getByRole("button", { name: "保存连接" }).click();
await page.getByLabel("模型 ID").fill("example-video-model");
await page.getByLabel("提示词").fill("清晨薄雾中的山谷，镜头缓慢向前推进");
await page.getByRole("button", { name: "URL", exact: true }).click();
await page.getByRole("button", { name: "视频", exact: true }).click();
await page.getByLabel("参考素材 URL").fill("https://example.invalid/reference.mp4");
await page.getByRole("button", { name: "添加 URL" }).click();
await page.locator('input[type="file"]').setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: pixel });
await page.getByRole("button", { name: "生成视频" }).click();
await page.getByText("任务已提交：video_ui_check_001").waitFor();
await page.waitForTimeout(5_500);
await page.getByText("36", { exact: true }).waitFor();

const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });

const payloadValid = submittedPayload?.model === "example-video-model"
  && submittedPayload?.prompt?.length > 0
  && submittedPayload?.input_reference?.[0] === "https://example.invalid/reference.mp4"
  && String(submittedPayload?.input_reference?.[1] || "").startsWith("data:image/png;base64,");

if (!payloadValid) throw new Error(`Unexpected payload: ${JSON.stringify(submittedPayload)}`);
if (desktopOverflow || mobileOverflow) throw new Error("Page has horizontal overflow");
if (errors.length) throw new Error(errors.join("\n"));

console.log(JSON.stringify({
  title: await page.title(),
  desktopOverflow,
  mobileOverflow,
  payloadValid,
  errors,
}, null, 2));

await browser.close();
