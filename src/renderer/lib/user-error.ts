const IMPLEMENTATION_ERROR =
  /Cannot read properties|is not a function|is not defined|window\.autocut|selectAndScanAssets/i;

export type UserError = {
  title: string;
  detail: string;
  action: string;
};

const RULES: Array<[RegExp, UserError]> = [
  [/model.*(?:not found|does not exist|unavailable)|404.*model/i, {
    title: "当前模型不可用",
    detail: "百炼账号无法调用当前选择的模型，或者模型标识填写有误。",
    action: "请到系统设置更换可用模型后重试。"
  }],
  [/401|403|API key|required|unauthorized/i, {
    title: "服务授权失效",
    detail: "当前 AI 服务密钥无效或没有对应权限。",
    action: "请到系统设置重新保存 API Key 后重试。"
  }],
  [/429|rate.?limit|too many/i, {
    title: "请求过于频繁",
    detail: "AI 服务正在限流，本次内容没有丢失。",
    action: "请稍等一分钟后重试当前步骤。"
  }],
  [/timeout|timed out|network|fetch failed/i, {
    title: "网络连接失败",
    detail: "暂时无法连接 AI 服务，本地草稿已经保留。",
    action: "检查网络后重试当前步骤。"
  }],
  [/font|字体/i, {
    title: "字幕字体不可用",
    detail: "所选字体不存在、损坏或格式不受支持。",
    action: "请重新选择 TTF 或 OTF 字体。"
  }],
  [/flac|audio|音乐|音频.*损坏/i, {
    title: "音频文件不可用",
    detail: "背景音乐或口播音频无法读取。",
    action: "请更换音频，或重新扫描音乐文件夹。"
  }],
  [/ENOSPC|disk.*full|磁盘空间/i, {
    title: "磁盘空间不足",
    detail: "当前磁盘无法继续写入成片或缓存。",
    action: "清理磁盘空间或更换工作目录后重试。"
  }],
  [/backend|service.*ready|服务.*就绪/i, {
    title: "本地服务尚未就绪",
    detail: "媒体处理服务正在启动或已意外退出。",
    action: "请重启软件，草稿和任务记录不会丢失。"
  }]
];

export function mapUserError(error: unknown, fallback: string): UserError {
  const raw = error instanceof Error ? error.message.trim() : "";
  const message = raw.replace(
    /^Error invoking remote method '[^']+': Error:\s*/i,
    ""
  );
  if (IMPLEMENTATION_ERROR.test(message)) {
    return {
      title: "程序组件未正确加载",
      detail: "桌面端组件没有正常建立连接。",
      action: "请重启软件；若仍失败，请重新安装最新版。"
    };
  }
  const match = RULES.find(([pattern]) => pattern.test(message));
  if (match) return match[1];
  if (/[\u3400-\u9fff]/.test(message)) {
    return {
      title: fallback,
      detail: message.replace(/\s*\((\d{3})\)$/u, "（错误码 $1）"),
      action: "请按提示修正后重试当前步骤。"
    };
  }
  return {
    title: fallback,
    detail: `${fallback.replace(/[。！!]+$/u, "")}，请稍后重试。`,
    action: "如多次失败，请导出诊断包并联系技术人员。"
  };
}

export function toUserMessage(error: unknown, fallback: string): string {
  const mapped = mapUserError(error, fallback);
  return mapped.title === fallback ? mapped.detail : `${mapped.title}：${mapped.action}`;
}
