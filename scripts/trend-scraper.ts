/**
 * Hack 2: Trend hijack — polls RSS feeds, scores with LLM, enqueues studio.trend_hijack.
 * Run via cron every 15m or: npx tsx scripts/trend-scraper.ts
 */
import { createLlmClient } from "../packages/agents/src/llm.js";
import { enqueueJob } from "../packages/platform/src/queue.js";

const RSS_FEEDS = [
  {
    url: "https://news.google.com/rss/search?q=personal+finance&hl=en-US&gl=US&ceid=US:en",
    niche: "slow_money",
    channelSlug: "slow_money",
  },
  {
    url: "https://news.google.com/rss/search?q=stoicism+philosophy&hl=en-US&gl=US&ceid=US:en",
    niche: "philosophy",
    channelSlug: "stoic_hour",
  },
];

async function fetchHeadlines(feedUrl: string, limit = 5): Promise<string[]> {
  try {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    const titles: string[] = [];
    const re = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && titles.length < limit) {
      const t = m[1]?.trim();
      if (t && !t.includes("Google News")) titles.push(t);
    }
    return titles;
  } catch {
    return [
      "Major tech layoffs shake markets",
      "Stoicism rises among Gen Z workers",
    ];
  }
}

async function main() {
  const llm = await createLlmClient();

  for (const feed of RSS_FEEDS) {
    const headlines = await fetchHeadlines(feed.url);
    for (const title of headlines) {
      const result = await llm.complete(
        [
          {
            role: "system",
            content:
              "Score 0-100 for niche match + 72hr search potential. JSON: { score, reason }",
          },
          { role: "user", content: JSON.stringify({ title, niche: feed.niche }) },
        ],
        { temperature: 0 }
      );
      let score = 50;
      try {
        score = Number(JSON.parse(result.text).score ?? 50);
      } catch {
        /* use default */
      }
      if (score >= 75) {
        await enqueueJob(
          "studio.trend_hijack",
          { topic: title, channelSlug: feed.channelSlug, score },
          { priority: 1 }
        );
        console.log("Enqueued trend hijack", feed.channelSlug, title, score);
      }
    }
  }
}

main().catch(console.error);
