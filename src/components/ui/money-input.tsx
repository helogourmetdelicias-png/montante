'use client';

import { forwardRef, type ComponentProps } from 'react';
import { Input } from './input';
import { formatMoneyInput, parseMoneyDigits } from '@/lib/money-input';

type MoneyInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Keeps the API value decimal while presenting bank-style cent entry. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput({ value, onValueChange, ...props }, ref) {
  return <Input {...props} ref={ref} type="text" inputMode="numeric" placeholder={props.placeholder ?? '0,00'}
    value={formatMoneyInput(value)} onChange={event => {
      const next = parseMoneyDigits(event.target.value);
      if (next !== null) onValueChange(next);
    }} />;
});
