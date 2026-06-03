import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import {
  JOB_PRIORITY,
  JobTypeSchema,
  jobQueueDomain,
  type JobType,
  type QueueDomain,
} from "./types.js";
import { loadEnv } from "./config.js";

export interface WestboundJobPayload {
  type: JobType;
  productionRunId?: string;
  payload: Record<string, unknown>;
}

const QUEUE_NAMES: Record<QueueDomain, string> = {
  sync: "westbound-sync",
  studio: "westbound-studio",
  agent: "westbound-agent",
};

const QUEUE_CONCURRENCY: Record<QueueDomain, number> = {
  sync: 8,
  studio: 2,
  agent: 4,
};

let _redis: Redis | null = null;
const _queues = new Map<QueueDomain, Queue<WestboundJobPayload>>();

export function createRedisConnection(): Redis {
  if (_redis) return _redis;
  const env = loadEnv();
  _redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return _redis;
}

export function getJobQueue(domain: QueueDomain): Queue<WestboundJobPayload> {
  let q = _queues.get(domain);
  if (!q) {
    q = new Queue<WestboundJobPayload>(QUEUE_NAMES[domain], {
      connection: createRedisConnection(),
    });
    _queues.set(domain, q);
  }
  return q;
}

/** @deprecated use getJobQueue */
export function createJobQueue(_connection?: Redis): Queue<WestboundJobPayload> {
  return getJobQueue("studio");
}

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options?: JobsOptions & { productionRunId?: string }
): Promise<string> {
  JobTypeSchema.parse(type);
  const domain = jobQueueDomain(type);
  const queue = getJobQueue(domain);
  const priority = JOB_PRIORITY[type];
  const job = await queue.add(
    type,
    {
      type,
      productionRunId: options?.productionRunId,
      payload,
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
      priority,
      ...options,
    }
  );
  return job.id ?? "";
}

export type JobHandler = (job: Job<WestboundJobPayload>) => Promise<void>;

export function createJobWorker(
  handlers: Partial<Record<JobType, JobHandler>>,
  domain: QueueDomain,
  connection?: Redis
): Worker<WestboundJobPayload> {
  const conn = connection ?? createRedisConnection();
  const limiter =
    domain === "studio"
      ? { max: 1, duration: 60_000 }
      : undefined;

  return new Worker<WestboundJobPayload>(
    QUEUE_NAMES[domain],
    async (job) => {
      const handler = handlers[job.data.type];
      if (!handler) {
        throw new Error(`No handler for job type: ${job.data.type}`);
      }
      await handler(job);
    },
    {
      connection: conn,
      concurrency: QUEUE_CONCURRENCY[domain],
      limiter,
    }
  );
}

export function createAllWorkers(
  handlers: Partial<Record<JobType, JobHandler>>
): Worker<WestboundJobPayload>[] {
  return (["sync", "studio", "agent"] as QueueDomain[]).map((d) =>
    createJobWorker(handlers, d)
  );
}

export async function recordDeadLetterJob(
  job: Job<WestboundJobPayload>,
  errorMessage: string
): Promise<void> {
  const { createSupabaseAdmin } = await import("./db.js");
  const db = createSupabaseAdmin();
  await db.from("dead_letter_jobs").insert({
    job_type: job.data.type,
    production_run_id: job.data.productionRunId ?? null,
    payload: job.data.payload,
    error_message: errorMessage,
  });
}
