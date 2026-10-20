'use client';

import { useEffect, useState } from 'react';
import { businessDateKey } from '@/lib/cash-register/business-day';

export default function BusinessDate() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  return <time dateTime={now ? businessDateKey(now) : undefined} className="text-sm text-slate-500">
    {now ? now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Data da operação'}
  </time>;
}
