/**
 * Hack 2 stub: wire to Google News / Reddit / finance feeds.
 * Scores >75 should enqueue studio.trend_hijack via worker API.
 */
import { createLlmClient } from "../packages/agents/src/llm.js";
import { enqueueJob } from "../packages/platform/src/queue.js";

const SAMPLE_HEADLINES = [
  { title: "Major tech layoffs shake markets", niche: "slow_money" },
  { title: "Stoicism rises among Gen Z workers", niche: "stoic_hour" },
];

async function main() {
  const llm = await createLlmClient();
  for (const item of SAMPLE_HEADLINES) {
    const result = await llm.complete(
      [
        {
          role: "system",
          content:
            "Score 0-100 for niche match + 72hr search potential. JSON: { score, reason }",
        },
        { role: "user", content: JSON.stringify(item) },
      ],
      { temperature: 0 }
    );
    let score = 50;
    try {
      score = Number(JSON.parse(result.text).score ?? 50);
    } catch {
      /* stub */
    }
    if (score >= 75) {
      await enqueueJob("studio.trend_hijack", {
        topic: item.title,
        channelSlug: item.niche,
        score,
      });
      console.log("Enqueued trend hijack", item.title, score);
    }
  }
}

main().catch(console.error);
