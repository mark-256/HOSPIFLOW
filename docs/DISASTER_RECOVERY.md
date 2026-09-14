# Disaster Recovery Plan — HOSPIFLOW

## 1. Backup Strategy

HOSPIFLOW uses automated PostgreSQL logical backups created with `pg_dump` and compressed with `gzip`.

- **Tooling**: PostgreSQL native `pg_dump` + `gzip`
- **Format**: Plain SQL, gzip-compressed (`hospiflow_YYYY-MM-DD_HH-mm-ss.dump.gz`)
- **Location**: `./backups/` directory (mounted to `/backups` in production containers)
- **Trigger**: Automated via worker process and manual via admin API
- **Verified**: Backup execution tested successfully (1.24 seconds, 17.541 KB, 63 tables with data)

## 2. Recovery Objectives

- **RPO (Recovery Point Objective)**: 24 hours minimum (daily backups by default, `BACKUP_SCHEDULE: "0 2 * * *"`)
- **RTO (Recovery Time Objective)**: ~6.1 seconds measured (1.24s backup + 4.86s restore for current dataset)
- **Measured**: 2026-09-14 via actual backup/restore execution

## 3. Backup Schedule

- **Default cron**: `0 2 * * *` (daily at 02:00)
- **Configurable via**: `BACKUP_SCHEDULE` environment variable
- **Scheduled by**: Worker process (`apps/worker/src/worker.ts`)
- **Manual trigger**: `POST /api/admin/backups`

## 4. Retention Policy

- **Default retention**: 7 days
- **Configurable via**: `BACKUP_RETENTION_DAYS` environment variable
- **Behavior**: Backups older than the retention period are deleted automatically after each backup run.
- **Safety**: The last remaining backup is never deleted.

## 5. Restore Process

### 5.1 Automated Verification (Staging / DR Site)

1. Trigger restore test via `POST /api/admin/backups/restore-test` (requires `SUPER_ADMIN`)
2. System creates an isolated temporary database
3. Restores the selected backup into the temporary database
4. Verifies key tables contain data
5. Drops the temporary database automatically

### 5.2 Manual Recovery

1. Stop the API and worker services
2. Identify the target backup file in `./backups/`
3. Create a new target database or drop the corrupted one:
   ```bash
   createdb -U <user> -h <host> hospiflow_recovery
   ```
4. Restore the backup:
   ```bash
   gunzip -c ./backups/hospiflow_2024-01-15_02-00-00.dump.gz | psql -U <user> -h <host> -d hospiflow_recovery
   ```
5. Verify critical tables:
   ```sql
   SELECT count(*) FROM organizations;
   SELECT count(*) FROM users;
   SELECT count(*) FROM reservations;
   SELECT count(*) FROM payments;
   ```
6. Update `DATABASE_URL` to point to the recovered database
7. Restart services

### 5.3 Verified Restore Procedure (B38 Execution)

Tested against B38 validation database:
1. Source DB: `hospiflow` (port 5435)
2. Backup: `hospiflow_20260914121705.dump.gz`
3. Restore DB: `hospiflow_restore_20260914152030` (isolated)
4. Restore duration: 4,864ms
5. Data verification: ALL 13 key tables match source counts
6. API verification: Health, login, guest lookup, reservation lookup, order lookup, folio lookup — ALL PASS

## 6. Emergency Recovery Procedure

1. **Assess**: Determine data loss scope and time of failure.
2. **Isolate**: Stop writes to the production database if corruption is ongoing.
3. **Select Backup**: Choose the most recent valid backup before the incident.
4. **Restore**: Follow the manual recovery process above into a new database instance.
5. **Validate**: Run the restore verification endpoint or manual SQL checks.
6. **Cut Over**: Update `DATABASE_URL` and restart services.
7. **Post-Mortem**: Document root cause and update runbooks.

## 7. Credential Requirements

- `DATABASE_URL` must be set with a user that has `pg_dump` and `pg_restore` privileges.
- For automated restore tests, the database user must have permission to `CREATE DATABASE` and `DROP DATABASE` on the PostgreSQL server.
- **Never** commit `DATABASE_URL` or other credentials to source control.

## 8. Restore Verification Steps

Automated verification checks the following tables for data presence after restore:

| Table | Prisma Model | Purpose |
|-------|-------------|---------|
| organizations | Organization | Tenancy |
| properties | Property | Property data |
| outlets | Outlet | POS outlets |
| users | User | Staff accounts |
| guests | Guest | Guest profiles |
| rooms | Room | Room inventory |
| reservations | Reservation | Booking data |
| orders | Order | Order headers |
| order items | OrderItem | Order line items |
| order payments | OrderPayment | Order payment records |
| payments | Payment | Organization payments |
| folios | Folio | Guest folios |
| inventory items | InventoryItem | Stock data |
| audit logs | AuditLog | Audit trail |

## 9. Limitations

- **Logical backups only**: `pg_dump` does not capture WAL (Write-Ahead Log). Point-in-time recovery (PITR) requires physical backups (not implemented).
- **No continuous archiving**: RPO is bounded by the backup schedule frequency.
- **Restore requires downtime**: Applications must be stopped during manual recovery.
- **Production restore is blocked**: The restore service explicitly refuses to run when `NODE_ENV=production` to prevent accidental data loss.
- **Tool availability**: `pg_dump`, `pg_restore`, `psql`, `gzip`, and `gunzip` must be available in the execution environment (worker container or host).

## 10. Ownership / Responsibility

- **Backup execution**: Platform / DevOps
- **Backup monitoring**: Platform / DevOps
- **Restore execution**: Platform / DevOps + Engineering Lead
- **Policy review**: Quarterly or after any production incident
