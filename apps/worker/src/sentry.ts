export function initSentry(): void {
  if (!process.env.SENTRY_DSN) return;
  void import("@sentry/node").then((Sentry) => {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      release: process.env.GIT_SHA,
    });
  });
}

export function captureJobException(
  err: Error,
  tags: Record<string, string | undefined>
): void {
  if (!process.env.SENTRY_DSN) return;
  void import("@sentry/node")
    .then((Sentry) => Sentry.captureException(err, { tags }))
    .catch(() => undefined);
}
