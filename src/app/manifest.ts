import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LK Pilates',
    short_name: 'LK Pilates',
    description: 'Sistema de controle de alunos e aulas',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e40af',
    icons: [
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/apple-icon.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  }
}
