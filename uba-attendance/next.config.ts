import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // REQUIRED FOR CAPACITOR APK
  trailingSlash: true, // REQUIRED FOR CAPACITOR NAVIGATION
  images: {
    unoptimized: true, // NEXT.JS IMAGE OPTIMIZATION DOES NOT WORK IN APKs
  },
  // Ensure we don't use server-side environment variables in the client
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  }
};

export default nextConfig;