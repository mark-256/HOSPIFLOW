import { redirect } from 'next/navigation';

export default async function LegacyQROrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/qr-order?token=${encodeURIComponent(token)}`);
}
