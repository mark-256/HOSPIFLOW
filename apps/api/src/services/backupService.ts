import { execSync } from 'child_process'
import { createGunzip, createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { createReadStream, existsSync } from 'fs'
import { stat, unlink, mkdir } from 'fs/promises'
import path from 'path'
import { config } from '../config'

async function runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const stdout = execSync(command, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 } as any)
    return { stdout: stdout as string, stderr: '' }
  } catch (error: any) {
    return { stdout: error.stdout || '', stderr: error.stderr || error.message }
  }
}

export interface BackupMetadata {
  startedAt: string
  completedAt: string
  duration: number
  backupPath: string
  size: number
  status: 'success' | 'failed'
  error?: string
}

export async function createBackup(): Promise<BackupMetadata> {
  const backupDir = config.backupDir || './backups'
  const startedAt = new Date().toISOString()
  const startTime = Date.now()
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '')
  const filename = `hospiflow_${timestamp}.dump.gz`
  const backupPath = path.join(backupDir, filename)

  const metadata: BackupMetadata = {
    startedAt,
    completedAt: '',
    duration: 0,
    backupPath,
    size: 0,
    status: 'failed',
  }

  try {
    await ensureBackupDir(backupDir)

    const dbUrl = config.databaseUrl
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not configured')
    }

    const escapedUrl = dbUrl.replace(/"/g, '\\"')
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

    console.log(`Backup completed successfully: ${backupPath} (${stats.size} bytes)`)

    await applyRetentionPolicy(backupDir)

    return metadata
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    metadata.completedAt = new Date().toISOString()
    metadata.duration = Date.now() - startTime
    metadata.error = errorMessage
    console.error(`Backup failed: ${errorMessage}`)

    if (existsSync(backupPath)) {
      try {
        await unlink(backupPath)
      } catch {
        // ignore cleanup errors
      }
    }

    return metadata
  }
}

export async function applyRetentionPolicy(backupDir?: string): Promise<void> {
  const dir = backupDir || config.backupDir || './backups'
  const retentionDays = config.backupRetentionDays || 7
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)

  try {
    const files = await import('fs/promises').then(fs => fs.readdir(dir))
    const dumpFiles = files.filter(f => f.endsWith('.dump.gz'))

    if (dumpFiles.length === 0) return

    let deletedCount = 0
    for (const file of dumpFiles) {
      const filePath = path.join(dir, file)
      try {
        const stats = await stat(filePath)
        if (stats.mtime < cutoff) {
          if (dumpFiles.length <= 1) {
            console.log(`Retention: skipping ${file} - it is the only remaining backup`)
            continue
          }
          await unlink(filePath)
          console.log(`Retention: deleted old backup ${file} (${stats.size} bytes, mtime ${stats.mtime.toISOString()})`)
          deletedCount++
        }
      } catch (error) {
        console.error(`Retention: error processing ${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (deletedCount > 0) {
      console.log(`Retention: deleted ${deletedCount} old backup(s)`)
    }
  } catch (error) {
    console.error(`Retention policy failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function listBackups(backupDir?: string): Promise<Array<{ filename: string; path: string; size: number; mtime: string }>> {
  const dir = backupDir || config.backupDir || './backups'
  try {
    const files = await import('fs/promises').then(fs => fs.readdir(dir))
    const dumpFiles = files.filter(f => f.endsWith('.dump.gz'))
    
    const backups = await Promise.all(
      dumpFiles.map(async filename => {
        const filePath = path.join(dir, filename)
        try {
          const stats = await stat(filePath)
          return {
            filename,
            path: filePath,
            size: stats.size,
            mtime: stats.mtime.toISOString(),
          }
        } catch {
          return null
        }
      })
    )

    return backups.filter((b): b is NonNullable<typeof b> => b !== null).sort((a, b) => b.mtime.localeCompare(a.mtime))
  } catch (error) {
    console.error(`Failed to list backups: ${error instanceof Error ? error.message : String(error)}`)
    return []
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
