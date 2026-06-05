import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://uba-veltech-attendance-system.vercel.app';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Disallow Googlebot from crawling authenticated routes
      disallow: ['/api/', '/admin', '/coordinator', '/home'],
    },
    sitemap: `${baseUrl}/sitemap.xml`, // Next.js automatically maps sitemap.ts to this URL
  };
}
