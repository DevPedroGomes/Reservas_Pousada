import './globals.css';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import { cn } from '../lib/utils';
import { ErrorBoundary } from '../components/error-boundary';

const font = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Diária - Gestão de Reservas para Pousadas',
  description: 'Diária — reservas, hóspedes e equipe da sua pousada em um só lugar.'
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
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
