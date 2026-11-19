import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { version as desktopVersion } from '../../../desktop/package.json';
import './globals.css';
import '@/styles/index.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#101217',
};

export const metadata: Metadata = {
  title: 'M&N · A Lei do Trono',
  description: 'Comunidade, jogos e chamadas de voz.',
  referrer: 'no-referrer',
  other: { 'mn-desktop-version': desktopVersion },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var keys=Object.keys(localStorage);var themeKey=keys.find(function(k){return k.indexOf('mnTheme:')===0;});var theme=themeKey?localStorage.getItem(themeKey):'purple';if(theme)document.documentElement.dataset.theme=theme;var cursorKey=keys.find(function(k){return k.indexOf('mnCursor:')===0;});var cursor=cursorKey?localStorage.getItem(cursorKey):'royal';document.documentElement.dataset.cursor=cursor||'royal';var motionKey=keys.find(function(k){return k.indexOf('mnReducedMotion:')===0;});var motion=motionKey?localStorage.getItem(motionKey):'0';document.documentElement.dataset.reducedMotion=(motion==='1'||motion==='true')?'true':'false';}catch(e){}})();`,
          }}
        />
        <Script src="/auth-boot.js" strategy="beforeInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
