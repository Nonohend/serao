import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mon Coloc IA',
    short_name: 'Coloc IA',
    description:
      'Budget, anti-gaspillage et aide à la consommation — ton coloc virtuel intelligent.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0d13',
    theme_color: '#0b0d13',
    orientation: 'portrait',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
