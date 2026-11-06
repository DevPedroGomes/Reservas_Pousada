import './globals.css';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import { cn } from '../lib/utils';
import { ErrorBoundary } from '../components/error-boundary';
import { AvisoDeCookies } from '../components/legal/AvisoDeCookies';
import { Medicao } from '../components/medicao/Medicao';
import { RegistrarPwa } from '../components/pwa/Pwa';

const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'], display: 'swap' });
const texto = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-sans', weight: ['400', '500', '600'], display: 'swap' });
const dado = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'], display: 'swap', preload: false });

const URL_APP = process.env.NEXT_PUBLIC_APP_URL || 'https://diaria.pgdev.com.br';

export const metadata: Metadata = {
  metadataBase: new URL(URL_APP),
  title: {
    default: 'Diária: sistema de reservas para pousadas',
    template: '%s',
  },
  description: 'Reservas, hóspedes e equipe da sua pousada em um só lugar. Teste grátis por 14 dias.',
  applicationName: 'Diária',
  icons: {
    icon: [{ url: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icones/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'Diária', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f2ed' },
    { media: '(prefers-color-scheme: dark)', color: '#14120e' },
  ],
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={cn('min-h-dvh bg-background font-sans antialiased', display.variable, texto.variable, dado.variable)}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <AvisoDeCookies />
        <Medicao />
        <RegistrarPwa />
      </body>
    </html>
  );
}
