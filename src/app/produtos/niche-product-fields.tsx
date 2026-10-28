'use client';
import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import type { BusinessNiche } from '@/lib/business-niche';
import { getMaterialSuggestions, getNicheAttributeKeys, PRODUCT_GENDERS, PRODUCT_PACKAGING, type ProductAttributes } from '@/lib/product-attributes';

type Props = {
  niche: BusinessNiche | null;
  brand: string;
  attributes: ProductAttributes;
  onBrandChange: (brand: string) => void;
  onAttributesChange: (attributes: ProductAttributes) => void;
};

export default function NicheProductFields({ niche, brand, attributes, onBrandChange, onAttributesChange }: Props) {
  const materialId = useId();
  function text(key: 'volume' | 'expiryDate' | 'lot' | 'size' | 'color', label: string, placeholder?: string, type = 'text') {
    return <label className="block text-sm font-medium">{label}<Input type={type} maxLength={120} placeholder={placeholder} value={attributes[key] ?? ''} onChange={event => onAttributesChange({ ...attributes, [key]: event.target.value || null })} className="mt-2 h-10 font-normal" /></label>;
  }

  return <>
    {niche !== 'IT_SUPPORT' && niche !== 'PHONE_REPAIR' && getNicheAttributeKeys(niche).includes('material') && <div className="space-y-2"><label htmlFor={materialId} className="block text-sm font-medium">Material (opcional)</label><Input id={materialId} list={`${materialId}-options`} maxLength={120} value={attributes.material ?? ''} placeholder="Selecione uma sugestão ou digite o material" onChange={event => onAttributesChange({ ...attributes, material: event.target.value || null })} className="h-10 font-normal" /><datalist id={`${materialId}-options`}>{getMaterialSuggestions(niche).map(material => <option key={material} value={material} />)}</datalist></div>}
    {(niche === 'COSMETICS' || niche === 'CONSTRUCTION') && <label className="block text-sm font-medium">{niche === 'COSMETICS' ? 'Marca / Linha' : 'Marca / Fabricante'}<Input value={brand} maxLength={80} placeholder={niche === 'COSMETICS' ? 'Ex.: Natura, Boticário, Avon' : 'Ex.: Tigre, Vedacit, Suvinil'} onChange={event => onBrandChange(event.target.value)} className="mt-2 h-10 font-normal" /></label>}
    {niche === 'COSMETICS' && <>
      {text('volume', 'Volume / Conteúdo', 'Ex.: 100ml, 50g')}
      {text('expiryDate', 'Data de validade (opcional)', undefined, 'date')}
      {text('lot', 'Lote (opcional)')}
    </>}
    {niche === 'CLOTHING' && <>
      {text('size', 'Tamanho', 'Ex.: P, M, G, 38, 40, Único')}
      {text('color', 'Cor / Estampa')}
      <label className="block text-sm font-medium">Gênero<select value={attributes.gender ?? ''} onChange={event => onAttributesChange({ ...attributes, gender: event.target.value as ProductAttributes['gender'] || null })} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-normal"><option value="">Selecione (opcional)</option>{PRODUCT_GENDERS.map(value => <option key={value}>{value}</option>)}</select></label>
    </>}
    {niche === 'BEVERAGES' && <>
      <label className="block text-sm font-medium">Embalagem<select value={attributes.packaging ?? ''} onChange={event => onAttributesChange({ ...attributes, packaging: event.target.value as ProductAttributes['packaging'] || null })} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-normal"><option value="">Selecione (opcional)</option>{PRODUCT_PACKAGING.map(value => <option key={value}>{value}</option>)}</select></label>
      {text('volume', 'Volume', 'Ex.: 350ml, 600ml, 1L, 2L')}
      <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2"><input type="checkbox" checked={attributes.requiresContainer ?? false} onChange={event => onAttributesChange({ ...attributes, requiresContainer: event.target.checked, ...(!event.target.checked ? { containerValue: null } : {}) })} className="h-4 w-4 accent-orange-600" /><span className="font-medium">Exige Vasilhame / Casco</span></label>
      {attributes.requiresContainer && <label className="block text-sm font-medium">Valor do casco (R$)<MoneyInput value={attributes.containerValue?.toString() ?? ''} onValueChange={value => onAttributesChange({ ...attributes, containerValue: value === '' ? null : Number(value) })} className="mt-2 h-10 font-normal" /></label>}
    </>}
  </>;
}
