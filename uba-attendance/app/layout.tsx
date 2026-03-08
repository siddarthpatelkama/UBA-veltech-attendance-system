'use client';

import { useEffect } from "react";
import "./globals.css";

// Metadata Configuration (ADDED SEO FIELDS HERE)
const metadataValues = {
  title: "UBA Attendance | Vel Tech",
  description: "Unnat Bharat Abhiyan Attendance Portal & Field Operations CRM.",
  manifest: "/manifest.json",
  keywords: "UBA Veltech, Vel Tech UBA, Unnat Bharat Abhiyan, Vel Tech University, Attendance Tracker, Field Operations",
  url: "https://uba-veltech-attendance-system.vercel.app",
  image: "/uba-logo.png"
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  // 1. PWA SERVICE WORKER REGISTRATION
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("[PWA] Service Worker Active:", reg.scope))
          .catch((err) => console.error("[PWA] Registration Failed:", err));
      });
    }
  }, []);

  return (
    <html lang="en">
      <head>
        <title>{metadataValues.title}</title>
        <meta name="description" content={metadataValues.description} />
        <link rel="manifest" href={metadataValues.manifest} />
        
        {/* BRANDING: Using your uba-logo.png as the icon */}
        <link rel="icon" href="/uba-logo.png" />
        <link rel="apple-touch-icon" href="/uba-logo.png" />
        
        <meta name="theme-color" content="#FF5722" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        
        {/* iOS Compatibility */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="UBA Portal" />

        {/* --- FEATURE 12: NEW SEO & OPENGRAPH TAGS INJECTED HERE --- */}
        <meta name="keywords" content={metadataValues.keywords} />
        <meta name="author" content="VTU28319" />
        <meta property="og:title" content={metadataValues.title} />
        <meta property="og:description" content={metadataValues.description} />
        <meta property="og:image" content={metadataValues.image} />
        <meta property="og:url" content={metadataValues.url} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="UBA Vel Tech" />
        {/* ---------------------------------------------------------- */}

      </head>
      <body className="antialiased bg-white text-gray-900 min-h-screen flex flex-col">
        
        {/* MAIN APP CONTENT */}
        <main className="flex-1">
          {children}
        </main>

        {/* GLOBAL DEVELOPER FOOTER */}
        <footer className="bg-[#FFF9F5] border-t border-[#FF5722]/20 py-8 mt-auto">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
            
            {/* LEFT: Official UBA Socials */}
            <div className="flex flex-col items-center md:items-start gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#FF5722]/60">Official UBA Vel Tech</p>
              <div className="flex gap-4">
                <a href="https://www.instagram.com/veltech_uba2.0/" target="_blank" rel="noreferrer" className="text-[#FF5722] hover:text-[#E64A19] transition-transform hover:scale-110">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" /></svg>
                </a>
                <a href="https://www.youtube.com/@veltechofficial" target="_blank" rel="noreferrer" className="text-[#FF5722] hover:text-[#E64A19] transition-transform hover:scale-110">
                   <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M19.812 5.418c.861.23 1.538.907 1.768 1.768C21.998 8.746 22 12 22 12s0 3.255-.418 4.814a2.504 2.504 0 0 1-1.768 1.768c-1.56.419-7.814.419-7.814.419s-6.255 0-7.814-.419a2.505 2.505 0 0 1-1.768-1.768C2 15.255 2 12 2 12s0-3.255.417-4.814a2.507 2.507 0 0 1 1.768-1.768C5.744 5 11.998 5 11.998 5s6.255 0 7.814.418ZM15.194 12 10 15V9l5.194 3Z" clipRule="evenodd" /></svg>
                </a>
                <a href="https://www.linkedin.com/school/veltechuniversity/posts/?feedView=all" target="_blank" rel="noreferrer" className="text-[#FF5722] hover:text-[#E64A19] transition-transform hover:scale-110">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd" /></svg>
                </a>
              </div>
            </div>

            {/* RIGHT: Developer Credit */}
            <div className="text-center md:text-right">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#A9B0B9] mb-1">Architected & Engineered By</p>
              <p className="text-sm font-black text-gray-900 uppercase tracking-widest">SiddarthPatelKama <span className="text-[#FF5722]">| VTU28319</span></p>
              <div className="flex justify-center md:justify-end gap-4 mt-2">
                 <a href="https://linkedin.com/in/siddarthpatelkama" target="_blank" rel="noreferrer" className="text-[10px] font-black text-[#A9B0B9] hover:text-[#FF5722] uppercase tracking-widest transition flex items-center gap-1">
                   🔗 LinkedIn
                 </a>
                 <span className="text-gray-300">•</span>
                 <a href="https://github.com/siddarthpatelkama" target="_blank" rel="noreferrer" className="text-[10px] font-black text-[#A9B0B9] hover:text-[#FF5722] uppercase tracking-widest transition flex items-center gap-1">
                   💻 GitHub
                 </a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}