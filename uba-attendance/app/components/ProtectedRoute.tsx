"use client";

import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

interface ProtectedRouteProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://uba-veltech-attendance-backend-system.onrender.com";

  useEffect(() => {
    let isMounted = true; 

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      
      if (!user) {
        setLoading(false);
        router.replace("/login");
        return;
      }

      const cachedRole = localStorage.getItem('uba_cached_role');

      // OFFLINE OR CACHE-FIRST BYPASS
      if (!navigator.onLine && cachedRole) {
        console.log("[OFFLINE MODE] Bypassing backend auth check...");
        if (allowedRoles.includes(cachedRole) || cachedRole === "student_coordinator") {
          setLoading(false); 
          return;
        } else {
          router.replace("/home");
          return;
        }
      }

      // ONLINE VERIFICATION (With timeout fallback)
      try {
        const token = await user.getIdToken();
        
        // 5-second timeout controller so it doesn't hang forever
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(`${API_URL}/whoami`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error("Failed to fetch role");

        const data = await res.json();
        localStorage.setItem('uba_cached_role', data.role); // Cache it

        if (!isMounted) return;

        if (!allowedRoles.includes(data.role) && data.role !== "student_coordinator") {
          router.replace("/home");
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.warn("Auth check slow/failed, using cache:", err);
        if (isMounted) {
           if (cachedRole && (allowedRoles.includes(cachedRole) || cachedRole === "student_coordinator")) {
             setLoading(false);
           } else {
             setLoading(false);
             router.replace("/home"); // Default safe route
           }
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router, API_URL]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-black">
        <div className="w-12 h-12 border-4 border-orange-100 border-t-[#FF5722] rounded-full animate-spin mb-4"></div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#FF5722] animate-pulse">Verifying Credentials</p>
      </div>
    );
  }

  return <>{children}</>;
}