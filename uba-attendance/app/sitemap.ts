import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://uba-veltech-attendance-system.vercel.app';
  const currentDate = new Date();

  return [
    {
      url: `${baseUrl}`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 1.0, // Primary entry point for Googlebot
    },
    {
      url: `${baseUrl}/portal`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9, // Main marketing/splash page
    },
    {
      url: `${baseUrl}/login`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/home`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.5, // Protected route, low SEO priority
    },
    {
      url: `${baseUrl}/coordinator`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.5, // Protected route, low SEO priority
    },
    {
      url: `${baseUrl}/admin`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.5, // Protected route, low SEO priority
    },
  ];
}
