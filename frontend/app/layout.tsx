import './globals.css';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import { cn } from '../lib/utils';

const font = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Minha Pousada - Gestao de Reservas',
  description: 'Sistema de gestao de reservas para pousadas.'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={cn('min-h-screen bg-background font-sans antialiased', font.variable)}>
        <div className="ambient" />
        {children}
      </body>
    </html>
  );
}
