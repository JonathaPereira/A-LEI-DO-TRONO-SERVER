import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import '@/styles/index.css';

export const metadata: Metadata = {
  title: 'M&N · A Lei do Trono',
  description: 'Comunidade, jogos e chamadas de voz.',
  referrer: 'no-referrer',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <Script src="/auth-boot.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
