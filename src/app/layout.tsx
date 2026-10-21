import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Montante PDV — Seu gestor comercial',
  description: 'Sistema de ponto de venda e gestão comercial para sua loja.',
  openGraph: {
    title: 'Montante PDV — Seu gestor comercial',
    description: 'Sistema de ponto de venda e gestão comercial para sua loja.',
    locale: 'pt_BR',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
