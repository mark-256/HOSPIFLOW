import { Router, Response } from 'express'
import { authMiddleware, requirePermission, AuthenticatedRequest } from '../middleware/auth'
import { createBackup, listBackups, applyRetentionPolicy } from '../services/backupService'
import { verifyBackup, restoreBackup } from '../services/restoreService'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.post('/', requirePermission('finance_edit'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await createBackup()
    if (result.status === 'success') {
      return res.status(201).json({ success: true, data: result })
    }
    return res.status(500).json({ success: false, error: { code: 'BACKUP_FAILED', message: result.error || 'Backup failed' } })
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'BACKUP_FAILED', message: error instanceof Error ? error.message : String(error) } })
  }
}))

router.get('/', requirePermission('finance_edit'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backups = await listBackups()
    return res.json({ success: true, data: backups })
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'LIST_FAILED', message: error instanceof Error ? error.message : String(error) } })
  }
}))

router.get('/:id/verify', requirePermission('finance_edit'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const backupPath = decodeURIComponent(req.params.id)
    const result = await verifyBackup(backupPath)
    if (result.valid) {
      return res.json({ success: true, data: result })
    }
    return res.status(400).json({ success: false, error: { code: 'VERIFY_FAILED', message: result.error || 'Backup verification failed' } })
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'VERIFY_FAILED', message: error instanceof Error ? error.message : String(error) } })
  }
}))

router.post('/restore-test', requirePermission('finance_edit'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { backupPath } = req.body
    if (!backupPath) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'backupPath is required' } })
    }

    const verifyResult = await verifyBackup(backupPath)
    if (!verifyResult.valid) {
      return res.status(400).json({ success: false, error: { code: 'VERIFY_FAILED', message: verifyResult.error || 'Backup is not valid for restore' } })
    }

    const restoreResult = await restoreBackup(backupPath)
    if (restoreResult.success) {
      return res.json({ success: true, data: restoreResult })
    }
    return res.status(500).json({ success: false, error: { code: 'RESTORE_TEST_FAILED', message: restoreResult.error || 'Restore test failed' } })
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'RESTORE_TEST_FAILED', message: error instanceof Error ? error.message : String(error) } })
  }
}))

router.post('/retention-run', requirePermission('finance_edit'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    await applyRetentionPolicy()
    return res.json({ success: true, data: { message: 'Retention policy applied' } })
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'RETENTION_FAILED', message: error instanceof Error ? error.message : String(error) } })
  }
}))

export default router
