export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function currentLogLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env === "debug" || env === "info" || env === "warn" || env === "error") {
    return env;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const SECRET_KEY = /key|secret|token|password/i;

function redactContext(ctx?: LogContext): LogContext | undefined {
  if (!ctx) return ctx;
  const out: LogContext = { ...ctx };
  for (const k of Object.keys(out)) {
    if (SECRET_KEY.test(k) && typeof out[k] === "string") {
      out[k] = "[REDACTED]";
    }
  }
  return out;
}

export interface LogContext {
  productionRunId?: string;
  jobId?: string;
  jobType?: string;
  gitSha?: string;
  [key: string]: unknown;
}

export function log(level: LogLevel, message: string, ctx?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLogLevel()]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    gitSha: process.env.GIT_SHA,
    ...redactContext(ctx),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
};
