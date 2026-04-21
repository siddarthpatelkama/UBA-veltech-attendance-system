import type { Metadata } from 'next';
import "./globals.css";
import ClientLayout from "./ClientLayout";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://uba-veltech-attendance-system.vercel.app'),
  title: {
    default: 'UBA Club | Vel Tech Attendance',
    template: '%s | UBA Vel Tech'
  },
  description: 'Official UBA Club Field Session and Attendance Tracker for Vel Tech University. Secure, real-time QR verification.',
  applicationName: 'UBA Attendance System',
  keywords: ['UBA', 'Vel Tech', 'Attendance', 'Unnat Bharat Abhiyan', 'Student Portal'],
  authors: [{ name: 'VTU28319' }],
  creator: 'VTU28319',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: '/',
    siteName: 'UBA Vel Tech',
    title: 'UBA Club Attendance Portal',
    description: 'Live field session tracking and digital ID verification for UBA Vel Tech members.',
    images: [
      {
        url: '/uba-logo.png',
        width: 800,
        height: 600,
        alt: 'UBA Vel Tech Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UBA Club | Vel Tech Attendance',
    description: 'Live field session tracking and digital ID verification.',
    images: ['/uba-logo.png'],
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#FF5722" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="UBA Portal" />
      </head>
      <body className="antialiased bg-white text-gray-900 min-h-screen flex flex-col">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}