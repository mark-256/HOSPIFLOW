import 'dotenv/config'
import app from './app'

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...')
  process.exit(0)
})
