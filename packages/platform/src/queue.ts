import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { JobTypeSchema, type JobType } from "./types.js";
import { loadEnv } from "./config.js";

export interface WestboundJobPayload {
  type: JobType;
  productionRunId?: string;
  payload: Record<string, unknown>;
}

const QUEUE_NAME = "westbound-jobs";

export function createRedisConnection(): Redis {
  const env = loadEnv();
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export function createJobQueue(connection?: Redis): Queue<WestboundJobPayload> {
  const conn = connection ?? createRedisConnection();
  return new Queue<WestboundJobPayload>(QUEUE_NAME, { connection: conn });
}

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options?: JobsOptions & { productionRunId?: string }
): Promise<string> {
  JobTypeSchema.parse(type);
  const queue = createJobQueue();
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
      ...options,
    }
  );
  return job.id ?? "";
}

export type JobHandler = (
  job: Job<WestboundJobPayload>
) => Promise<void>;

export function createJobWorker(
  handlers: Partial<Record<JobType, JobHandler>>,
  connection?: Redis
): Worker<WestboundJobPayload> {
  const conn = connection ?? createRedisConnection();
  return new Worker<WestboundJobPayload>(
    QUEUE_NAME,
    async (job) => {
      const handler = handlers[job.data.type];
      if (!handler) {
        throw new Error(`No handler for job type: ${job.data.type}`);
      }
      await handler(job);
    },
    { connection: conn, concurrency: 5 }
  );
}
