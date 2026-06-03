import { createLlmClient } from "@westbound/agents";
import { createRepository, createSupabaseAdmin, enqueueJob, logger } from "@westbound/platform";
import { assertVoicePublishAllowed, type ChannelRow } from "./compliance.js";
import { YouTubeFactory } from "./youtube-factory.js";

export async function enqueueChannelVideo(
  channelSlug: string,
  topic: string
): Promise<string> {
  const repo = createRepository();
  const channel = (await repo.getChannelBySlug(channelSlug)) as
    | (ChannelRow & {
        id: string;
        slug: string;
        elevenlabs_voice_id?: string;
        script_template_version?: string;
      })
    | null;

  if (!channel) {
    throw new Error(`Channel not found: ${channelSlug}`);
  }

  const llm = await createLlmClient();
  const db = createSupabaseAdmin();

  let script = "";
  let citations: Record<string, unknown> = {};

  if (channel.kind === "voice") {
    const result = await llm.complete(
      [
        {
          role: "system",
          content: `Write a 8-minute ${channel.slug} explainer script. Include citations array with 2-3 sources {title, url}. JSON: { script, citations }`,
        },
        { role: "user", content: JSON.stringify({ topic, niche: channel.slug }) },
      ],
      { temperature: 0.5 }
    );
    try {
      const parsed = JSON.parse(result.text) as {
        script?: string;
        citations?: Record<string, unknown>[];
      };
      script = parsed.script ?? result.text;
      citations = {
        sources: parsed.citations ?? [],
      };
    } catch {
      script = result.text;
      citations = { sources: [] };
    }

    assertVoicePublishAllowed(channel, { citations_json: citations });
  } else {
    const factory = new YouTubeFactory();
    const spec = await factory.assembleDailyVideo(channelSlug);
    script = spec.introVoiceoverText;
  }

  const projects = await repo.listProjects();
  const yt = projects.find((p) => p.slug === "youtube_faceless");

  const { data: video, error: vErr } = await db
    .from("youtube_videos")
    .insert({
      channel_id: channel.id,
      title: `${channelSlug}: ${topic}`.slice(0, 120),
      citations_json: channel.kind === "voice" ? citations : null,
      metadata: { topic, script: script.slice(0, 5000), tier: "volume" },
    })
    .select()
    .single();
  if (vErr) throw vErr;

  const { data: run } = await db
    .from("production_runs")
    .insert({
      project_id: yt?.id,
      kind: "youtube_video",
      title: video?.title ?? topic,
      stage: "scheduled",
      metadata: {
        tier: "volume",
        channelSlug,
        videoId: video?.id,
        topic,
        voiceChannel: channel.kind === "voice",
      },
    })
    .select()
    .single();

  await enqueueJob(
    "youtube.assemble_video",
    { channelSlug, topic, videoId: video?.id, runId: run?.id },
    { productionRunId: run?.id, priority: 10 }
  );

  logger.info("Channel video enqueued", { channelSlug, topic, runId: run?.id });
  return run?.id ?? "";
}
