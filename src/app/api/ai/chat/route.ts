import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parsePeriod } from '@/lib/reports/period';
import { AiProviderError, askGroq } from '@/lib/ai/groq';
import { financialSnapshot } from '@/lib/ai/snapshot';
import { reserveAiRequest } from '@/lib/ai/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const schema = z.object({
  question: z.string().trim().min(1).max(1000),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(12000) }).strict()).max(6).default([]),
}).strict();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) return json({ error: 'Entre na sua conta.' }, 401);
  if (!['owner', 'admin'].includes(session.user.role)) return json({ error: 'A IA financeira é exclusiva para responsáveis e administradores da loja.' }, 403);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Origem inválida.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Formato inválido.' }, 415);
  // Bound the body before JSON parsing, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Informe uma pergunta.' }, 400);
  let raw = '', size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 48000) { await reader.cancel(); return json({ error: 'Conversa muito longa. Limpe a conversa e tente novamente.' }, 413); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch { return json({ error: 'Não foi possível ler a pergunta.' }, 400); }
  let input;
  try { input = schema.parse(JSON.parse(raw)); } catch { return json({ error: 'Confira a pergunta, o período e o tamanho da conversa.' }, 400); }
  const url = new URL(request.url);
  url.search = new URLSearchParams({ startDate: input.startDate, endDate: input.endDate }).toString();
  const period = parsePeriod(url);
  if (!period || period.endBefore.getTime() - period.startAt.getTime() > 366 * 86400000) return json({ error: 'Escolha um período válido de até 366 dias.' }, 400);
  if (!process.env.GROQ_API_KEY?.trim()) return json({ error: 'A IA aguarda a configuração da conexão Groq pelo administrador do Montante.' }, 503);
  const release = reserveAiRequest(session.user.tenantId);
  if (!release) return json({ error: 'Aguarde a consulta atual ou tente novamente em um minuto.' }, 429);
  try {
    const snapshot = await financialSnapshot(session.user.tenantId, period);
    const answer = await askGroq(input.question, input.history, snapshot);
    return json({ answer, snapshot });
  } catch (error) {
    if (error instanceof AiProviderError) return json({ error: error.message }, error.status);
    return json({ error: 'Não foi possível consultar os dados da loja. Tente novamente.' }, 500);
  } finally { release(); }
}
