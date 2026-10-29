import type { BusinessNiche } from './business-niche';

export const PRODUCT_GENDERS = ['Masculino', 'Feminino', 'Unissex', 'Infantil'] as const;
export const PRODUCT_PACKAGING = ['Garrafa Retornável', 'Lata', 'Long Neck', 'PET', 'Chope'] as const;

export type ProductAttributes = {
  material?: string | null;
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
  COSMETICS: ['volume', 'expiryDate', 'lot', 'material'],
  CLOTHING: ['size', 'color', 'gender', 'material'],
  BEVERAGES: ['packaging', 'volume', 'requiresContainer', 'containerValue'],
  CONSTRUCTION: ['material'],
  OTHER: [],
  PHONE_REPAIR: ['material'],
  IT_SUPPORT: ['material'],
};

const MATERIAL_SUGGESTIONS: Partial<Record<BusinessNiche, readonly string[]>> = {
  CLOTHING: ['Algodão', 'Poliéster', 'Linho', 'Jeans', 'Viscose', 'Couro', 'Sintético'],
  CONSTRUCTION: ['PVC', 'Aço', 'Alumínio', 'Madeira', 'Vidro', 'Cerâmica', 'Concreto'],
  PHONE_REPAIR: ['Silicone', 'Vidro temperado', 'Plástico ABS', 'Alumínio', 'Aço', 'Cobre'],
  IT_SUPPORT: ['Plástico ABS', 'Alumínio', 'Aço', 'Cobre', 'Silicone', 'Fibra de vidro'],
  COSMETICS: ['Silicone', 'Vidro', 'Plástico', 'Algodão', 'Aço inoxidável', 'Látex'],
};
export function getMaterialSuggestions(niche: BusinessNiche | null): readonly string[] {
  return niche ? MATERIAL_SUGGESTIONS[niche] ?? [] : [];
}

export function getNicheAttributeKeys(niche: BusinessNiche | null) {
  return [...new Set<keyof ProductAttributes>([...(niche ? NICHE_ATTRIBUTE_KEYS[niche] : []), 'expiryDate', 'lot'])];
}
