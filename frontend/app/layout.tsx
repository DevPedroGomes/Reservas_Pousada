import './globals.css';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { cn } from '../lib/utils';
import { ErrorBoundary } from '../components/error-boundary';
import { AvisoDeCookies } from '../components/legal/AvisoDeCookies';
import { Medicao } from '../components/medicao/Medicao';
import { RegistrarPwa } from '../components/pwa/Pwa';

// Fontes no repositório: o build não depende de buscar nada no Google Fonts.
const display = localFont({
  src: [
    { path: './fontes/space-grotesk-latin-500-normal.woff2', weight: '500' },
    { path: './fontes/space-grotesk-latin-600-normal.woff2', weight: '600' },
    { path: './fontes/space-grotesk-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-display',
  display: 'swap',
});
const texto = localFont({
  src: [
    { path: './fontes/ibm-plex-sans-latin-400-normal.woff2', weight: '400' },
    { path: './fontes/ibm-plex-sans-latin-500-normal.woff2', weight: '500' },
    { path: './fontes/ibm-plex-sans-latin-600-normal.woff2', weight: '600' },
  ],
  variable: '--font-sans',
  display: 'swap',
  preload: false,
});
const dado = localFont({
  src: [
    { path: './fontes/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: './fontes/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
  ],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
});

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
