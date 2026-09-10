export interface GenerationErrorDiagnosis {
  title: string;
  detail: string;
  code?: string;
  retryable: boolean;
}

export function diagnoseGenerationError(message?: string): GenerationErrorDiagnosis {
  const raw = message?.trim() || "上游返回生成失败";

  if (/103101|no privilege/i.test(raw)) {
    return {
      title: "上游账号没有模型权限",
      detail: "任务已到达上游，但当前凭据没有所选模型的权限。请开通模型权限或更换凭据。",
      code: "103101",
      retryable: false,
    };
  }

  if (/moderated|nsfw/i.test(raw)) {
    return {
      title: "内容审核未通过",
      detail: "上游审核拒绝了本次生成。调整提示词或参考素材后可以重新提交。",
      retryable: true,
    };
  }

  return {
    title: "本次生成未完成",
    detail: raw,
    retryable: true,
  };
}
