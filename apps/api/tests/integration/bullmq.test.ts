import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const TEST_QUEUE_NAME = 'hospiflow-b38-test'
const BACKUP_QUEUE_NAME = 'backups'

let redis: Redis

function createConnection(): Redis {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null })
}

beforeAll(async () => {
  redis = new Redis(REDIS_URL, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  })
  redis.on('error', () => undefined)
})

afterAll(async () => {
  if (redis) {
    await redis.quit().catch(() => redis.disconnect())
  }
})

describe('B38 — Redis / BullMQ Functional Test', () => {
  it('connects to Redis and responds to PING', async () => {
    const pong = await redis.ping()
    expect(pong).toBe('PONG')
  }, 15000)

  it('enqueues, processes and completes a job through a BullMQ worker', async () => {
    const queue = new Queue(TEST_QUEUE_NAME, { connection: createConnection() })
    const worker = new Worker(
      TEST_QUEUE_NAME,
      async job => ({
        processed: true,
        input: job.data.value,
        doubled: job.data.value * 2,
      }),
      { connection: createConnection() }
    )

    try {
      await worker.waitUntilReady()

      const completed = new Promise<{ id: string; returnvalue: unknown }>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('BullMQ job did not complete within 15s')),
            15000
          )
          worker.on('completed', job => {
            clearTimeout(timer)
            resolve({ id: job.id ?? '', returnvalue: job.returnvalue })
          })
          worker.on('failed', (job, err) => {
            clearTimeout(timer)
            reject(err)
          })
        }
      )

      const job = await queue.add(
        'b38-test-job',
        { value: 21 },
        { removeOnComplete: true }
      )
      expect(job.id).toBeTruthy()

      const result = await completed
      expect(result.id).toBe(job.id)
      expect(result.returnvalue).toEqual({
        processed: true,
        input: 21,
        doubled: 42,
      })
    } finally {
      await worker.close()
      await queue.close()
    }
  }, 30000)

  it('cleans up the dedicated test queue without touching the backups queue', async () => {
    const backupKeysBefore = await redis.keys(`bull:${BACKUP_QUEUE_NAME}:*`)

    const testKeys = await redis.keys(`bull:${TEST_QUEUE_NAME}:*`)
    if (testKeys.length > 0) {
      await redis.del(...testKeys)
    }

    expect(await redis.keys(`bull:${TEST_QUEUE_NAME}:*`)).toHaveLength(0)
    expect(await redis.keys(`bull:${BACKUP_QUEUE_NAME}:*`)).toEqual(backupKeysBefore)
  }, 15000)

  it('can open the existing HOSPIFLOW backups queue used by the worker', async () => {
    const queue = new Queue(BACKUP_QUEUE_NAME, { connection: createConnection() })
    try {
      const name = queue.name
      expect(name).toBe(BACKUP_QUEUE_NAME)
      const waiting = await queue.getJobCountByTypes('waiting', 'delayed', 'active')
      expect(waiting).toBeGreaterThanOrEqual(0)
    } finally {
      await queue.close()
    }
  }, 15000)
})
