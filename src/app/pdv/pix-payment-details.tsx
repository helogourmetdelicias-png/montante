'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PixPayment = { pixQrCode?: string; pixQrCodeUrl?: string; pixCopyPaste?: string };

export default function PixPaymentDetails({ payment, amount, manual }: { payment: PixPayment; amount: string; manual: boolean }) {
  const [notice, setNotice] = useState('');
  const codeInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setNotice(''); }, [payment.pixCopyPaste]);
  const source = payment.pixQrCode ? `data:image/png;base64,${payment.pixQrCode}` : payment.pixQrCodeUrl;

  async function copyCode() {
    if (!payment.pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(payment.pixCopyPaste);
      setNotice('Código Pix copiado.');
    } catch {
      codeInput.current?.focus();
      codeInput.current?.select();
      setNotice('Não foi possível copiar automaticamente. O código foi selecionado para você copiar.');
    }
  }

  return <>
    {source && <div className="mt-4">
      <p className="font-semibold text-orange-950">Escaneie para pagar{amount && Number.isFinite(Number(amount)) ? ` ${Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}</p>
      <Image src={source} alt="QR Code Pix para pagamento" width={288} height={288} unoptimized className="mx-auto my-3 h-auto w-72 max-w-full rounded-lg bg-white" />
      <p className="text-sm text-orange-900">Abra o Pix no aplicativo do banco e aponte a câmera para o QR Code.</p>
    </div>}
    {payment.pixCopyPaste && <div className="mt-4 space-y-2 text-left">
      <label htmlFor="pix-copy" className="text-xs font-medium text-orange-900">Pix Copia e Cola</label>
      <textarea ref={codeInput} id="pix-copy" readOnly value={payment.pixCopyPaste} className="min-h-16 w-full resize-none rounded-lg border border-orange-200 bg-white p-2 text-xs text-slate-700" />
      <Button type="button" variant="outline" onClick={() => void copyCode()} className="w-full bg-white"><Copy className="mr-2 h-4 w-4" />Copiar código Pix</Button>
      {notice && <p role="status" className="text-xs text-orange-900">{notice}</p>}
    </div>}
    {manual && <p className="mt-4 text-sm font-medium text-orange-950">Lojista: confira o dinheiro na conta antes de confirmar o recebimento. A leitura do QR Code não confirma o pagamento.</p>}
  </>;
}
