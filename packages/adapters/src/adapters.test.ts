import { describe, expect, it } from "vitest";
import { Pond5Publisher } from "./songtradr.js";
import { SeedanceVideoGenerator } from "./seedance.js";
import { UdioMusicGenerator } from "./udio.js";

describe("Pond5Publisher", () => {
  it("fails closed for AI music", async () => {
    const p = new Pond5Publisher();
    await expect(
      p.publish({
        title: "x",
        description: "y",
        mediaUri: "stub://a.wav",
      })
    ).rejects.toThrow(/rejects AI music/);
  });
});

describe("SeedanceVideoGenerator", () => {
  it("returns stub URI without live API", async () => {
    const g = new SeedanceVideoGenerator("fake-key");
    const result = await g.generate({
      prompt: "rain highway",
      shotType: "broll",
      durationSec: 5,
    });
    expect(result.uri).toContain("seedance");
    expect(result.costCents).toBe(45);
  });
});

describe("UdioMusicGenerator", () => {
  it("returns stub variations without live API", async () => {
    const g = new UdioMusicGenerator("fake-key");
    const tracks = await g.generate({
      prompt: "instrumental chill",
      instrumental: true,
      variations: 2,
    });
    expect(tracks).toHaveLength(2);
    expect(tracks[0]!.metadata.provider).toBe("udio");
  });
});
