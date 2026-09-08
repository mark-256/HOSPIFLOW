export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (process.env.SMTP_HOST) {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: parseInt(process.env.SMTP_PORT || '587'), auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } })
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html })
    return true
  }
  console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`)
  return true
}
