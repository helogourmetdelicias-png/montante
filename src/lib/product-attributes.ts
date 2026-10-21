import type { BusinessNiche } from './business-niche';

export const PRODUCT_GENDERS = ['Masculino', 'Feminino', 'Unissex', 'Infantil'] as const;
export const PRODUCT_PACKAGING = ['Garrafa Retornável', 'Lata', 'Long Neck', 'PET', 'Chope'] as const;

export type ProductAttributes = {
  volume?: string | null;
  expiryDate?: string | null;
  lot?: string | null;
  size?: string | null;
  color?: string | null;
  gender?: typeof PRODUCT_GENDERS[number] | null;
  packaging?: typeof PRODUCT_PACKAGING[number] | null;
  requiresContainer?: boolean;
  containerValue?: number | null;
};

const NICHE_ATTRIBUTE_KEYS: Record<BusinessNiche, ReadonlyArray<keyof ProductAttributes>> = {
  COSMETICS: ['volume', 'expiryDate', 'lot'],
  CLOTHING: ['size', 'color', 'gender'],
  BEVERAGES: ['packaging', 'volume', 'requiresContainer', 'containerValue'],
  CONSTRUCTION: [],
  OTHER: [],
};

export function getNicheAttributeKeys(niche: BusinessNiche | null) {
  return niche ? NICHE_ATTRIBUTE_KEYS[niche] : [];
}
