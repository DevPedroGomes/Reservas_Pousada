import './globals.css';
import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import { cn } from '../lib/utils';
import { ErrorBoundary } from '../components/error-boundary';
import { AvisoDeCookies } from '../components/legal/AvisoDeCookies';

const font = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

const URL_APP = process.env.NEXT_PUBLIC_APP_URL || 'https://diaria.pgdev.com.br';

export const metadata: Metadata = {
  metadataBase: new URL(URL_APP),
  title: {
    default: 'Diária — sistema de reservas para pousadas',
    template: '%s',
  },
  description: 'Reservas, hóspedes e equipe da sua pousada em um só lugar. Teste grátis por 14 dias.',
  applicationName: 'Diária',
};

export const viewport: Viewport = {
  themeColor: '#ea580c',
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
        <AvisoDeCookies />
      </body>
    </html>
  );
}
