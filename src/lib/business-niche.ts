import { PRODUCT_CATEGORIES } from './product-categories';

export const BUSINESS_NICHES = ['CONSTRUCTION', 'COSMETICS', 'CLOTHING', 'BEVERAGES', 'OTHER'] as const;
export type BusinessNiche = typeof BUSINESS_NICHES[number];
export const NICHE_LABELS: Record<BusinessNiche, string> = {
  CONSTRUCTION: 'Material de Construção',
  COSMETICS: 'Cosméticos',
  CLOTHING: 'Roupas e Acessórios',
  BEVERAGES: 'Depósito de Bebidas',
  OTHER: 'Outros / Geral',
};
const categories: Record<BusinessNiche, readonly string[]> = {
  CONSTRUCTION: PRODUCT_CATEGORIES,
  COSMETICS: ['Maquiagem', 'Perfumaria', 'Cuidados com a pele', 'Cuidados com os cabelos', 'Higiene pessoal', 'Acessórios de beleza'],
  CLOTHING: ['Roupas femininas', 'Roupas masculinas', 'Roupas infantis', 'Calçados', 'Bolsas e acessórios', 'Moda íntima'],
  BEVERAGES: ['Cervejas', 'Refrigerantes', 'Águas', 'Sucos', 'Vinhos', 'Destilados', 'Energéticos', 'Gelo e acessórios'],
  OTHER: ['Produtos gerais', 'Utilidades', 'Acessórios', 'Outros'],
};

/** Suggestions never restrict custom categories or reclassify existing products. */
export function getNicheCategories(niche: BusinessNiche | null): readonly string[] {
  return niche ? categories[niche] : [];
}
