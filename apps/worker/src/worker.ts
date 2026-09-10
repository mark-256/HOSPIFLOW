import type { Queue as BullMQQueue, Worker as BullMQWorker } from 'bullmq'
import { execSync } from 'child_process'
import { createGunzip } from 'zlib'
import { createReadStream, existsSync } from 'fs'
import { stat, unlink, mkdir, readdir } from 'fs/promises'
import path from 'path'

const BACKUP_DIR = process.env.BACKUP_DIR || './backups'
const DATABASE_URL = process.env.DATABASE_URL || ''
const BACKUP_SCHEDULE = process.env.BACKUP_SCHEDULE || '0 2 * * *'

interface BackupMetadata {
  startedAt: string
  completedAt: string
  duration: number
  backupPath: string
  size: number
  status: 'success' | 'failed'
  error?: string
}

async function runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const stdout = execSync(command, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 })
    return { stdout, stderr: '' }
  } catch (error: any) {
    return { stdout: error.stdout || '', stderr: error.stderr || error.message }
  }
}

async function createBackup(): Promise<BackupMetadata> {
  const startedAt = new Date().toISOString()
  const startTime = Date.now()
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '')
  const filename = `hospiflow_${timestamp}.dump.gz`
  const backupPath = path.join(BACKUP_DIR, filename)

  const metadata: BackupMetadata = {
    startedAt,
    completedAt: '',
    duration: 0,
    backupPath,
    size: 0,
    status: 'failed',
  }

  try {
    await ensureBackupDir(BACKUP_DIR)

    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured')
    }

    const escapedUrl = DATABASE_URL.replace(/"/g, '\\"')
    const escapedPath = backupPath.replace(/"/g, '\\"')
    const fullCmd = `pg_dump "${escapedUrl}" | gzip > "${escapedPath}"`

    const { stdout, stderr } = await runCommand(fullCmd)

    if (stderr && stderr.includes('ERROR')) {
      throw new Error(stderr.trim())
    }

    const stats = await stat(backupPath)
    if (stats.size === 0) {
      throw new Error('Backup file is empty')
    }

    await verifyGzipIntegrity(backupPath)

    metadata.completedAt = new Date().toISOString()
    metadata.duration = Date.now() - startTime
    metadata.size = stats.size
    metadata.status = 'success'

    console.log(`[BACKUP] Completed: ${backupPath} (${stats.size} bytes)`)
    await applyRetentionPolicy(BACKUP_DIR)

    return metadata
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    metadata.completedAt = new Date().toISOString()
    metadata.duration = Date.now() - startTime
    metadata.error = errorMessage
    console.error(`[BACKUP] Failed: ${errorMessage}`)

    if (existsSync(backupPath)) {
      try {
        await unlink(backupPath)
      } catch {
        // ignore
      }
    }

    return metadata
  }
}

async function applyRetentionPolicy(backupDir: string): Promise<void> {
  const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  try {
    const files = await readdir(backupDir)
    const dumpFiles = files.filter(f => f.endsWith('.dump.gz'))

    if (dumpFiles.length === 0) return

    let deletedCount = 0
    for (const file of dumpFiles) {
      const filePath = path.join(backupDir, file)
      try {
        const stats = await stat(filePath)
        if (stats.mtime < cutoff) {
          if (dumpFiles.length <= 1) {
            console.log(`[BACKUP] Retention: skipping ${file} - only remaining backup`)
            continue
          }
          await unlink(filePath)
          console.log(`[BACKUP] Retention: deleted ${file}`)
          deletedCount++
        }
      } catch (error) {
        console.error(`[BACKUP] Retention error for ${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (deletedCount > 0) {
      console.log(`[BACKUP] Retention: deleted ${deletedCount} old backup(s)`)
    }
  } catch (error) {
    console.error(`[BACKUP] Retention policy failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function verifyGzipIntegrity(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = createReadStream(filePath)
    const gunzip = createGunzip()

    readStream.on('error', reject)
    gunzip.on('error', reject)
    gunzip.on('data', () => {})
    gunzip.on('end', resolve)

    readStream.pipe(gunzip)
  })
}

async function ensureBackupDir(dir: string): Promise<void> {
  const resolvedDir = path.resolve(dir)
  await mkdir(resolvedDir, { recursive: true })
}

async function runScheduledBackup(): Promise<void> {
  const result = await createBackup()
  if (result.status === 'failed') {
    throw new Error(result.error || 'Scheduled backup failed')
  }
}

function parseCronToMs(cron: string): number | null {
  const parts = cron.split(' ')
  if (parts.length !== 5) return null

  const minute = parts[0]
  const hour = parts[1]

  if (minute === '*' && hour === '*') return 60 * 1000
  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2), 10)
    if (!isNaN(interval) && interval > 0) return interval * 60 * 1000
  }
  if (minute === '0' && hour === '*') return 60 * 60 * 1000
  if (minute === '0' && hour === '2') return 24 * 60 * 60 * 1000

  return null
}

async function verifyRedisConnection(redisUrl: string): Promise<void> {
  const { Redis } = await import('ioredis')
  const redis = new Redis(redisUrl, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  })
  redis.on('error', () => undefined)

  try {
    await redis.ping()
  } finally {
    redis.disconnect()
  }
}

async function startWorker(): Promise<void> {
  console.log('HOSPIFLOW Worker starting...')

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
  let queue: BullMQQueue | undefined
  let worker: BullMQWorker | undefined

  try {
    await verifyRedisConnection(redisUrl)

    const { Queue, Worker } = await import('bullmq')
    const connection = {
      url: redisUrl,
      connectTimeout: 5000,
    }

    queue = new Queue('backups', { connection })
    worker = new Worker(
      'backups',
      async () => {
        console.log('[BACKUP] Running scheduled backup via BullMQ')
        await runScheduledBackup()
      },
      { connection }
    )

    worker.on('error', error => {
      console.error('[BACKUP] BullMQ worker error:', error.message)
    })

    worker.on('completed', job => {
      console.log(`[BACKUP] Job ${job.id} completed`)
    })

    worker.on('failed', (job, err) => {
      console.error(`[BACKUP] Job ${job?.id} failed:`, err.message)
    })

    await queue.add(
      'scheduled-backup',
      {},
      {
        repeat: { pattern: BACKUP_SCHEDULE },
        jobId: 'scheduled-backup',
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
      }
    )

    await worker.waitUntilReady()

    console.log(`[BACKUP] Worker started with BullMQ (schedule: ${BACKUP_SCHEDULE})`)
  } catch (error) {
    await worker?.close().catch(() => undefined)
    await queue?.close().catch(() => undefined)

    console.warn('[BACKUP] BullMQ unavailable, using setInterval fallback')
    const intervalMs = parseCronToMs(BACKUP_SCHEDULE) || 24 * 60 * 60 * 1000
    console.log(`[BACKUP] Fallback interval: ${intervalMs}ms`)

    let backupRunning = false
    const runFallbackBackup = async () => {
      if (backupRunning) return

      backupRunning = true
      try {
        await runScheduledBackup()
      } catch (error) {
        console.error('[BACKUP] Fallback scheduler error:', error instanceof Error ? error.message : String(error))
      } finally {
        backupRunning = false
        setTimeout(runFallbackBackup, intervalMs)
      }
    }

    setTimeout(runFallbackBackup, intervalMs)
    console.log('[BACKUP] Worker started with setInterval fallback')
  }
}

startWorker().catch(error => {
  console.error('Worker failed to start:', error)
  process.exit(1)
})
