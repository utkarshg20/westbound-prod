import type {
  GenerationResult,
  VoiceGenerateInput,
  VoiceGenerator,
} from "./interfaces.js";
export class ElevenLabsVoiceGenerator implements VoiceGenerator {
  readonly name = "elevenlabs";

  constructor(
    private readonly apiKey: string,
    private readonly defaultVoiceId: string
  ) {}

  async generate(input: VoiceGenerateInput): Promise<GenerationResult> {
    const voiceId = input.voiceId ?? this.defaultVoiceId;
    if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID required");

    const blob = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
        },
        body: JSON.stringify({
          text: input.text,
          model_id: "eleven_multilingual_v2",
        }),
      }
    );

    if (!blob.ok) {
      throw new Error(`ElevenLabs ${blob.status}: ${await blob.text()}`);
    }

    const id = crypto.randomUUID();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const uri = `elevenlabs://${id}`;

    return {
      id,
      uri,
      metadata: {
        characterId: input.characterId,
        byteLength: buffer.length,
        storageHint: "upload buffer to R2 in worker",
      },
      costCents: 3,
    };
  }
}
