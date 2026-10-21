import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import MontanteAssistant from './montante-assistant';

export const dynamic = 'force-dynamic';
export default async function AiPage() {
  const session = await auth();
  if (!session?.user?.tenantId) redirect('/login');
  if (!['owner', 'admin'].includes(session.user.role)) redirect('/pdv');
  return <MontanteAssistant configured={Boolean(process.env.GROQ_API_KEY?.trim())} />;
}
