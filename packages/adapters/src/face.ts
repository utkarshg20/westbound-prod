export interface FaceEmbeddingClient {
  embed(uri: string): Promise<number[]>;
}

/** Deterministic stub embedding from URI string */
export class StubFaceEmbeddingClient implements FaceEmbeddingClient {
  async embed(uri: string): Promise<number[]> {
    const vec = new Array(128).fill(0);
    for (let i = 0; i < uri.length; i++) {
      vec[i % 128]! += uri.charCodeAt(i) / 1000;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

/** Replicate face-embeddings model (~$0.001/call) */
export class ReplicateFaceEmbeddingClient implements FaceEmbeddingClient {
  constructor(private readonly token: string) {}

  async embed(uri: string): Promise<number[]> {
    const res = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: process.env.REPLICATE_FACE_MODEL_VERSION ?? "face-embedding-stub",
        input: { image: uri },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`Replicate face embed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as { output?: number[] };
    if (Array.isArray(data.output) && data.output.length > 0) {
      return data.output;
    }
    return new StubFaceEmbeddingClient().embed(uri);
  }
}

export function createFaceEmbeddingClient(): FaceEmbeddingClient {
  const token = process.env.REPLICATE_API_TOKEN;
  if (token && process.env.USE_STUB_ADAPTERS !== "true") {
    return new ReplicateFaceEmbeddingClient(token);
  }
  return new StubFaceEmbeddingClient();
}
