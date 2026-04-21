import type { MetadataRoute } from 'next';

// 🚨 ADDED THIS LINE to fix the static build error
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/coordinator/', '/emergency/'],
      },
    ],
    sitemap: 'https://uba-veltech-attendance-system.vercel.app/sitemap.xml',
  };
}