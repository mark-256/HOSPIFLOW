export async function sendSms({ to, message }: { to: string; message: string }) {
  console.log(`[SMS MOCK] To: ${to} | Message: ${message}`)
  return true
}
