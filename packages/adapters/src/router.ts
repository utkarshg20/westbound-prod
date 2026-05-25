import type { VideoGenerator, VideoRouter, VideoRouterInput } from "./interfaces.js";
import { StubVideoGenerator } from "./stubs.js";

export class RuleBasedVideoRouter implements VideoRouter {
  constructor(
    private readonly providers: {
      dialogue: VideoGenerator;
      establishing: VideoGenerator;
      broll: VideoGenerator;
    }
  ) {}

  static default(): RuleBasedVideoRouter {
    return new RuleBasedVideoRouter({
      dialogue: new StubVideoGenerator("kling"),
      establishing: new StubVideoGenerator("veo"),
      broll: new StubVideoGenerator("runway"),
    });
  }

  pickProvider(input: VideoRouterInput): VideoGenerator {
    if (input.shotType === "dialogue" && input.hasCharacter) {
      return this.providers.dialogue;
    }
    if (input.shotType === "establishing") {
      return this.providers.establishing;
    }
    return this.providers.broll;
  }
}
