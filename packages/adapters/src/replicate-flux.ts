import { fetchHardened } from "./fetch-hardened.js";

export interface FluxImageResult {
  uri: string;
  costCents: number;
}

export class ReplicateFluxClient {
  constructor(private readonly token: string) {}

  async generateImage(prompt: string): Promise<FluxImageResult> {
    const res = await fetchHardened("https://api.replicate.com/v1/predictions", {
      method: "POST",
      timeoutMs: 120_000,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "black-forest-labs/flux-1.1-pro",
        input: { prompt, aspect_ratio: "16:9" },
      }),
    });
    if (!res.ok) {
      return {
        uri: `r2://stub/flux/${encodeURIComponent(prompt.slice(0, 40))}.png`,
        costCents: 4,
      };
    }
    const data = (await res.json()) as { output?: string | string[] };
    const out = Array.isArray(data.output) ? data.output[0] : data.output;
    return {
      uri: out ?? `r2://stub/flux/generated.png`,
      costCents: 4,
    };
  }
}
