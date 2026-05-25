import { loadEnv, shouldUseStubAdapters } from "@westbound/platform";
import type {
  ImageGenerator,
  LipSyncProvider,
  MusicGenerator,
  Publisher,
  VoiceGenerator,
} from "./interfaces.js";
import { CreatomateClient, CreatomatePublisher } from "./creatomate.js";
import { ElevenLabsVoiceGenerator } from "./elevenlabs.js";
import { HedraLipSyncProvider } from "./hedra.js";
import { KlingVideoGenerator } from "./kling.js";
import { RuleBasedVideoRouter } from "./router.js";
import { Pond5Publisher, SongtradrPublisher } from "./songtradr.js";
import { SunoMusicGenerator } from "./suno.js";
import {
  StubImageGenerator,
  StubLipSyncProvider,
  StubMusicGenerator,
  StubPublisher,
  StubVideoGenerator,
  StubVoiceGenerator,
} from "./stubs.js";
import { StubAwareYouTubePublisher } from "./youtube.js";

export interface AdapterRegistry {
  image: ImageGenerator;
  music: MusicGenerator;
  voice: VoiceGenerator;
  lipSync: LipSyncProvider;
  videoRouter: RuleBasedVideoRouter;
  publishers: Record<string, Publisher>;
  creatomate: CreatomateClient | null;
}

export function createStubRegistry(): AdapterRegistry {
  return {
    image: new StubImageGenerator(),
    music: new StubMusicGenerator(),
    voice: new StubVoiceGenerator(),
    lipSync: new StubLipSyncProvider(),
    videoRouter: RuleBasedVideoRouter.default(),
    publishers: {
      youtube: new StubPublisher("youtube"),
      spotify: new StubPublisher("spotify"),
      songtradr: new StubPublisher("songtradr"),
      pond5: new StubPublisher("pond5"),
      creatomate: new StubPublisher("creatomate"),
    },
    creatomate: null,
  };
}

export function createAdapterRegistry(): AdapterRegistry {
  if (shouldUseStubAdapters()) {
    return createStubRegistry();
  }

  const env = loadEnv();
  const kling = env.KLING_API_KEY
    ? new KlingVideoGenerator(
        env.KLING_API_KEY,
        env.KLING_API_BASE ?? "https://api.klingai.com"
      )
    : new StubVideoGenerator("kling");

  const veo = new StubVideoGenerator("veo");
  const runway = new StubVideoGenerator("runway");

  const videoRouter = new RuleBasedVideoRouter({
    dialogue: kling,
    establishing: veo,
    broll: runway,
  });

  const music = env.SUNO_API_KEY
    ? new SunoMusicGenerator(
        env.SUNO_API_KEY,
        env.SUNO_API_BASE ?? "https://api.suno.ai"
      )
    : new StubMusicGenerator();

  const voice =
    env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID
      ? new ElevenLabsVoiceGenerator(
          env.ELEVENLABS_API_KEY,
          env.ELEVENLABS_VOICE_ID
        )
      : new StubVoiceGenerator();

  const lipSync =
    env.HEDRA_API_KEY
      ? new HedraLipSyncProvider(
          env.HEDRA_API_KEY,
          env.HEDRA_API_BASE ?? "https://api.hedra.com"
        )
      : new StubLipSyncProvider();

  const creatomate = env.CREATOMATE_API_KEY
    ? new CreatomateClient(env.CREATOMATE_API_KEY)
    : null;

  const publishers: Record<string, Publisher> = {
    youtube: new StubAwareYouTubePublisher(
      env.YOUTUBE_CLIENT_ID,
      env.YOUTUBE_CLIENT_SECRET,
      env.YOUTUBE_REFRESH_TOKEN
    ),
    spotify: new StubPublisher("spotify"),
    songtradr: new SongtradrPublisher(process.env.SONGTRADR_API_KEY),
    pond5: new Pond5Publisher(),
  };

  if (creatomate && env.CREATOMATE_TEMPLATE_FACELESS) {
    publishers.creatomate = new CreatomatePublisher(
      creatomate,
      env.CREATOMATE_TEMPLATE_FACELESS
    );
  }

  return {
    image: new StubImageGenerator(),
    music,
    voice,
    lipSync,
    videoRouter,
    publishers,
    creatomate,
  };
}
