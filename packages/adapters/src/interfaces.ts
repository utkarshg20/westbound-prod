export interface GenerationResult {
  id: string;
  uri: string;
  metadata: Record<string, unknown>;
  costCents?: number;
}

export interface ImageGenerateInput {
  prompt: string;
  negativePrompt?: string;
  characterId?: string;
  loraVersion?: string;
  width?: number;
  height?: number;
}

export interface ImageGenerator {
  readonly name: string;
  generate(input: ImageGenerateInput): Promise<GenerationResult>;
}

export interface VideoGenerateInput {
  prompt: string;
  imageUri?: string;
  characterId?: string;
  durationSec?: number;
  shotType?: "dialogue" | "establishing" | "broll";
}

export interface VideoGenerator {
  readonly name: string;
  generate(input: VideoGenerateInput): Promise<GenerationResult>;
}

export interface MusicGenerateInput {
  prompt: string;
  lyrics?: string;
  personaId?: string;
  instrumental?: boolean;
  variations?: number;
}

export interface MusicGenerator {
  readonly name: string;
  generate(input: MusicGenerateInput): Promise<GenerationResult[]>;
}

export interface VoiceGenerateInput {
  text: string;
  characterId: string;
  voiceId?: string;
}

export interface VoiceGenerator {
  readonly name: string;
  generate(input: VoiceGenerateInput): Promise<GenerationResult>;
}

export interface LipSyncInput {
  videoUri: string;
  audioUri: string;
  characterId?: string;
}

export interface LipSyncProvider {
  readonly name: string;
  sync(input: LipSyncInput): Promise<GenerationResult>;
}

export interface PublishInput {
  title: string;
  description: string;
  mediaUri: string;
  scheduledAt?: Date;
  tags?: string[];
}

export interface Publisher {
  readonly platform: string;
  publish(input: PublishInput): Promise<{ externalId: string; url?: string }>;
}

export interface VideoRouterInput {
  script: string;
  shotType: "dialogue" | "establishing" | "broll";
  hasCharacter: boolean;
}

export interface VideoRouter {
  pickProvider(input: VideoRouterInput): VideoGenerator;
}
