'use client';

import { forwardRef, useState, type ComponentProps } from 'react';
import { Input } from './input';
import { formatMoneyInput, parseMoneyDecimal, parseMoneyDigits } from '@/lib/money-input';

type MoneyInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: string;
  onValueChange: (value: string) => void;
  entryMode?: 'cents' | 'decimal';
};

/** Shares currency formatting while keeping cent entry as the default for existing fields. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput({ value, onValueChange, entryMode = 'cents', onFocus, onBlur, ...props }, ref) {
  const [draft, setDraft] = useState<string | null>(null);
  return <Input {...props} ref={ref} type="text" inputMode={entryMode === 'decimal' ? 'decimal' : 'numeric'} placeholder={props.placeholder ?? '0,00'}
    value={entryMode === 'decimal' && draft !== null ? draft : formatMoneyInput(value)}
    onFocus={event => { if (entryMode === 'decimal') setDraft(value.replace('.', ',')); onFocus?.(event); }}
    onBlur={event => { setDraft(null); onBlur?.(event); }} onChange={event => {
      const next = entryMode === 'decimal' ? parseMoneyDecimal(event.target.value) : parseMoneyDigits(event.target.value);
      if (next !== null) { if (entryMode === 'decimal') setDraft(event.target.value); onValueChange(next); }
    }} />;
});
