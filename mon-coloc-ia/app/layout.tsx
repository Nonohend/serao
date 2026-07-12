import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Mon Coloc IA',
  description:
    'Budget, anti-gaspillage et aide à la consommation — ton coloc virtuel intelligent.',
};

export const viewport: Viewport = {
  themeColor: '#0b0d13',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className={manrope.className}>
        <div className="fond-anime" aria-hidden>
          <span className="blob-violet" />
          <span className="blob-cyan" />
          <span className="blob-magenta" />
        </div>
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
