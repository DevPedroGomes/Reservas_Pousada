import './globals.css';
import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import { cn } from '../lib/utils';

const font = Space_Grotesk({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Sistema de Reservas - Pousada',
  description: 'Frontend Next.js para o sistema de reservas da pousada.'
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
