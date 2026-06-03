import { createLlmClient } from "@westbound/agents";
import { createRepository, createSupabaseAdmin, logger } from "@westbound/platform";

export interface SupervisorInput {
  name: string;
  contact_email?: string;
  last_known_company?: string;
  placement_history?: unknown[];
}

export async function upsertSupervisors(inputs: SupervisorInput[]): Promise<number> {
  const db = createSupabaseAdmin();
  const { data, error } = await db.from("supervisors").insert(
    inputs.map((s) => ({
      name: s.name,
      contact_email: s.contact_email ?? null,
      last_known_company: s.last_known_company ?? null,
      placement_history: s.placement_history ?? [],
    }))
  ).select();
  if (error) throw error;
  return data?.length ?? 0;
}

/** Monthly cron: draft personalized outreach for Dan review */
export async function runSupervisorOutreachDrafts(): Promise<number> {
  const repo = createRepository();
  const db = createSupabaseAdmin();
  const supervisors = await repo.listSupervisors();
  const tracks = await repo.listTracks({ source: "sync" });
  const approved = tracks.filter((t) => t.metadata.qaStatus === "approved").slice(0, 50);
  const llm = await createLlmClient();

  let drafted = 0;
  for (const sup of supervisors.slice(0, 50)) {
    const history = (sup.placement_history as unknown[]) ?? [];
    const pick = approved.slice(0, 3).map((t) => t.id);

    const result = await llm.complete(
      [
        {
          role: "system",
          content:
            "Draft a 4-sentence personalized sync pitch email. Reference one recent placement. JSON: { subject, body }",
        },
        {
          role: "user",
          content: JSON.stringify({
            supervisor: sup.name,
            company: sup.last_known_company,
            recentPlacements: history.slice(0, 3),
            trackTitles: pick.map(
              (id) => approved.find((t) => t.id === id)?.title ?? id
            ),
          }),
        },
      ],
      { temperature: 0.3 }
    );

    let emailDraft = result.text;
    try {
      const parsed = JSON.parse(result.text) as { subject?: string; body?: string };
      emailDraft = `${parsed.subject ?? "Sync pitch"}\n\n${parsed.body ?? result.text}`;
    } catch {
      /* use raw */
    }

    const { error } = await db.from("supervisor_outreach").insert({
      supervisor_id: sup.id,
      track_ids: pick,
      email_draft: emailDraft,
      status: "pending_dan_review",
    });
    if (!error) drafted++;
  }

  logger.info("Supervisor outreach drafts created", { count: drafted });
  return drafted;
}
