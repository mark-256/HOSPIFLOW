import 'dotenv/config'
import app from './app'
import prisma from '@hospiflow/database'

const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

server.keepAliveTimeout = 65000
server.headersTimeout = 66000

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received — shutting down gracefully...`)
  server.close(() => {
    console.log('HTTP server closed')
    void prisma.$disconnect().then(() => {
      console.log('Database connections closed')
      process.exit(0)
    }).catch((err) => {
      console.error('Error closing database:', err)
      process.exit(1)
    })
  })
  setTimeout(() => {
    console.error('Forced shutdown — HTTP server did not close in time')
    process.exit(1)
  }, 10000)
}

process.on('SIGINT', () => { shutdown('SIGINT') })
process.on('SIGTERM', () => { shutdown('SIGTERM') })
