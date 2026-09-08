export async function sendWhatsApp({ to, message }: { to: string; message: string }) {
  console.log(`[WHATSAPP MOCK] To: ${to} | Message: ${message}`)
  return true
}
