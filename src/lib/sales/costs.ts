import { Prisma } from '@prisma/client';

// Null means unknown, not free. Round each line just like sale prices.
export function snapshotCost(parts: { quantity: Prisma.Decimal; unitCost: Prisma.Decimal | null | undefined }[], additional: Prisma.Decimal | null = new Prisma.Decimal(0)): Prisma.Decimal | null {
  if (additional == null || parts.some(part => part.unitCost == null)) return null;
  return parts.reduce((sum, part) => sum.add(part.unitCost!.mul(part.quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)), additional);
}
