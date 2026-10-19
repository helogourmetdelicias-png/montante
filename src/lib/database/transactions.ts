import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Retries serializable transactions only when Prisma reports a write conflict. */
export async function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2034' || attempt === 2) throw error;
    }
  }
  throw new Error('A transação serializável não pôde ser concluída.');
}
