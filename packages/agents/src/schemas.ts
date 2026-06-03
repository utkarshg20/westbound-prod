import { z } from "zod";

export const ContinuityResultSchema = z.object({
  passed: z.boolean(),
  flags: z.array(z.string()),
  notes: z.string(),
});

export const ShotPlanSchema = z.object({
  shots: z.array(
    z.object({
      index: z.number(),
      shotType: z.enum(["dialogue", "establishing", "broll"]),
      prompt: z.string(),
      hasCharacter: z.boolean(),
      providerHint: z.string(),
    })
  ),
});

export const SunoPromptOutputSchema = z.object({
  prompt: z.string(),
  negativePrompt: z.string(),
  bpm: z.number(),
  mood: z.string(),
  genre: z.string(),
  instrumental: z.boolean(),
});

export const TrackMetadataSchema = z.object({
  bpm: z.number(),
  key: z.string(),
  mood: z.array(z.string()),
  genre: z.string(),
  soundsLike: z.array(z.string()),
  useCases: z.array(z.string()),
  description: z.string(),
});

export const BriefScoreSchema = z.object({
  total: z.number(),
  breakdown: z.object({
    bpm: z.number(),
    vocal: z.number(),
    instruments: z.number(),
    mood: z.number(),
    length: z.number(),
    avoidViolations: z.number(),
  }),
  passed: z.boolean(),
  discard: z.boolean(),
  holdForDan: z.boolean(),
});

export const AnthropicMessageResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    })
  ),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_read_input_tokens: z.number().optional(),
    })
    .optional(),
});
