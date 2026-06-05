// middleware.ts
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - sitemap.xml
     * - robots.txt
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!sitemap.xml|robots.txt|_next/static|_next/image|favicon.ico).*)',
  ],
};
