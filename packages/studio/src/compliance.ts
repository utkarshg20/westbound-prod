export type ChannelKind = "music" | "voice";

export interface ChannelRow {
  kind: ChannelKind;
  trailer_uploaded_at: string | null;
  publish_cadence: string;
  demonetization_risk_flag?: boolean;
}

export interface VideoPublishInput {
  citations_json?: Record<string, unknown> | null;
}

export class ComplianceError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ComplianceError";
  }
}

export function assertVoicePublishAllowed(
  channel: ChannelRow,
  video: VideoPublishInput
): void {
  if (channel.kind !== "voice") return;

  if (!channel.trailer_uploaded_at) {
    throw new ComplianceError(
      "TRAILER_REQUIRED",
      "Voice channel requires Dan on-camera trailer before monetization-eligible upload"
    );
  }

  if (!video.citations_json || Object.keys(video.citations_json).length < 2) {
    throw new ComplianceError(
      "CITATIONS_REQUIRED",
      "Voice channel videos require citations_json with at least 2 source claims"
    );
  }
}

export function maxVideosPerWeek(cadence: string): number {
  switch (cadence) {
    case "daily":
      return 7;
    case "5_per_week":
      return 5;
    case "4_per_week":
      return 4;
    default:
      return 5;
  }
}
