import { execSync } from 'child_process'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { PrismaClient } from '@hospiflow/database'
import { config } from '../config'
import path from 'path'
import { randomUUID } from 'crypto'

async function runCommand(command: string, env: Record<string, string | undefined>): Promise<{ stdout: string; stderr: string }> {
  try {
    const stdout = execSync(command, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024, env: { ...process.env, ...env } as NodeJS.ProcessEnv } as any)
    return { stdout: stdout as string, stderr: '' }
  } catch (error: any) {
    return { stdout: error.stdout || '', stderr: error.stderr || error.message }
  }
}

export interface RestoreResult {
  success: boolean
  tempDatabase?: string
  verified: boolean
  tableCounts: Record<string, number>
  error?: string
}

export async function verifyBackup(backupPath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const stats = await stat(backupPath)
    if (stats.size === 0) {
      return { valid: false, error: 'Backup file is empty' }
    }

    await pipeline(createReadStream(backupPath), createGunzip())

    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function restoreBackup(backupPath: string): Promise<RestoreResult> {
  const dbUrl = config.databaseUrl
  if (!dbUrl) {
    return { success: false, verified: false, tableCounts: {}, error: 'DATABASE_URL is not configured' }
  }

  if (config.nodeEnv === 'production') {
    return { success: false, verified: false, tableCounts: {}, error: 'Restore to production database is not allowed' }
  }

  try {
    const url = new URL(dbUrl.replace(/^postgresql:\/\//, 'http://'))
    const host = url.hostname
    const port = url.port || '5432'
    const user = url.username
    const password = decodeURIComponent(url.password)

    const tempDbName = `hospiflow_restore_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    const tempDbUrl = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${tempDbName}`

    const envVars: Record<string, string | undefined> = {}
    if (password) envVars.PGPASSWORD = password

    const createDbCmd = `psql -U "${user}" -h "${host}" -p "${port}" -tc "SELECT 1 FROM pg_database WHERE datname = '${tempDbName}'" | grep -q 1 || psql -U "${user}" -h "${host}" -p "${port}" -c "CREATE DATABASE \\"${tempDbName}\\""`
    await runCommand(createDbCmd, envVars)

    const escapedPath = backupPath.replace(/"/g, '\\"')
    const restoreCmd = `gunzip -c "${escapedPath}" | psql -U "${user}" -h "${host}" -p "${port}" -d "${tempDbName}"`
    await runCommand(restoreCmd, envVars)

    const prisma = new PrismaClient({ datasources: { db: { url: tempDbUrl } } })

    const tablesToCheck = [
      'organization',
      'property',
      'outlet',
      'user',
      'guest',
      'room',
      'reservation',
      'order',
      'orderItem',
      'orderPayment',
      'payment',
      'folio',
      'inventoryItem',
      'auditLog',
    ]

    const tableCounts: Record<string, number> = {}
    for (const table of tablesToCheck) {
      try {
        tableCounts[table] = await (prisma as any)[table].count()
      } catch {
        tableCounts[table] = -1
      }
    }

    await prisma.$disconnect()

    const dropCmd = `psql -U "${user}" -h "${host}" -p "${port}" -c "DROP DATABASE \\"${tempDbName}\\""`
    await runCommand(dropCmd, envVars)

    const verified = Object.values(tableCounts).every(c => c >= 0)

    return {
      success: true,
      tempDatabase: tempDbName,
      verified,
      tableCounts,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Restore test failed: ${errorMessage}`)
    return {
      success: false,
      verified: false,
      tableCounts: {},
      error: errorMessage,
    }
  }
}
