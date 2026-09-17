import { redirect } from 'next/navigation'

export default function LegacyQROrderPage({ params }: { params: { token: string } }) {
  redirect(`/qr-order?token=${encodeURIComponent(params.token)}`)
}
