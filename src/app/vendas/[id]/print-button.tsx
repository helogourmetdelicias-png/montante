'use client';

export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-orange-600 px-4 py-2 font-medium text-white">Imprimir / salvar PDF</button>;
}
