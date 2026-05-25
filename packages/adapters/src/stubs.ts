import type {
  GenerationResult,
  ImageGenerateInput,
  ImageGenerator,
  LipSyncInput,
  LipSyncProvider,
  MusicGenerateInput,
  MusicGenerator,
  PublishInput,
  Publisher,
  VideoGenerateInput,
  VideoGenerator,
  VoiceGenerateInput,
  VoiceGenerator,
} from "./interfaces.js";

function stubUri(prefix: string, id: string): string {
  return `stub://${prefix}/${id}`;
}

export class StubImageGenerator implements ImageGenerator {
  readonly name = "stub-image";
  async generate(input: ImageGenerateInput): Promise<GenerationResult> {
    const id = crypto.randomUUID();
    return {
      id,
      uri: stubUri("image", id),
      metadata: { prompt: input.prompt, stub: true },
      costCents: 5,
    };
  }
}

export class StubVideoGenerator implements VideoGenerator {
  constructor(readonly name: string) {}
  async generate(input: VideoGenerateInput): Promise<GenerationResult> {
    const id = crypto.randomUUID();
    return {
      id,
      uri: stubUri(`video-${this.name}`, id),
      metadata: { prompt: input.prompt, shotType: input.shotType, stub: true },
      costCents: 50,
    };
  }
}

export class StubMusicGenerator implements MusicGenerator {
  readonly name = "stub-suno";
  async generate(input: MusicGenerateInput): Promise<GenerationResult[]> {
    const n = input.variations ?? 4;
    return Array.from({ length: n }, () => {
      const id = crypto.randomUUID();
      return {
        id,
        uri: stubUri("audio", id),
        metadata: { prompt: input.prompt, instrumental: input.instrumental, stub: true },
        costCents: 10,
      };
    });
  }
}

export class StubVoiceGenerator implements VoiceGenerator {
  readonly name = "stub-elevenlabs";
  async generate(input: VoiceGenerateInput): Promise<GenerationResult> {
    const id = crypto.randomUUID();
    return {
      id,
      uri: stubUri("voice", id),
      metadata: { characterId: input.characterId, stub: true },
      costCents: 3,
    };
  }
}

export class StubLipSyncProvider implements LipSyncProvider {
  readonly name = "stub-hedra";
  async sync(input: LipSyncInput): Promise<GenerationResult> {
    const id = crypto.randomUUID();
    return {
      id,
      uri: stubUri("lipsync", id),
      metadata: { videoUri: input.videoUri, stub: true },
      costCents: 25,
    };
  }
}

export class StubPublisher implements Publisher {
  constructor(readonly platform: string) {}
  async publish(_input: PublishInput): Promise<{ externalId: string; url?: string }> {
    const externalId = `${this.platform}_${crypto.randomUUID().slice(0, 8)}`;
    return {
      externalId,
      url: `https://example.com/${this.platform}/${externalId}`,
    };
  }
}
