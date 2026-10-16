import type { Metadata } from 'next';
import Script from 'next/script';
import manifest from '@/legacy/manifest.json';
import './globals.css';

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
        {manifest.styles.map((href) => (
          <link key={href} rel="stylesheet" href={'/' + href} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
