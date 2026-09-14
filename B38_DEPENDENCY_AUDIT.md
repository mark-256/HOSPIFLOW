# B38 Dependency Audit

## Direct Dependencies

### API Dependencies
- express: Web framework
- jsonwebtoken: JWT handling
- bcrypt: Password hashing
- prisma: Database ORM
- @prisma/client: Prisma client
- express-rate-limit: Rate limiting
- helmet: Security headers
- cors: CORS handling
- morgan: HTTP logging
- cookie-parser: Cookie parsing
- bullmq: Background job queue
- ioredis: Redis client

### Security-Relevant Dependencies

| Package | Version | Vulnerabilities | Severity |
|---------|---------|----------------|----------|
| bcrypt | 5.1.1 | 1 | Moderate |
| uuid | <11.1.1 | 1 | Moderate |
| @mapbox/node-pre-gyp | Varies | Multiple | High/Critical |

### Total Vulnerabilities
- Critical: 3
- High: 11
- Moderate: 6
- Total: 20

### Recommendation
Run `npm audit fix` for non-breaking fixes. Review critical/high vulnerabilities before production deployment.

## Database
- PostgreSQL 16 (tested with 15 and 16)
- Prisma 6.x

## Runtime
- Node.js >= 18.0.0
- npm >= 9.0.0
