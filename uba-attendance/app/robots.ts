import type { MetadataRoute } from 'next';

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