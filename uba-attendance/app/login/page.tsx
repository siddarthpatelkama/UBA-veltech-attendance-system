"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { signInWithPopup, GoogleAuthProvider, getRedirectResult, User, onAuthStateChanged } from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  
  // THE FIX: This lock prevents the double-fetching race condition
  const isRouting = useRef(false); 

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://10.120.248.230:5000";

  // --- ROLE-BASED ROUTING ENGINE ---
  const routeUserByRole = async (user: User) => {
    if (isRouting.current) return; // If already routing, ignore duplicate calls
    isRouting.current = true;

    try {
      const token = await user.getIdToken();
      
      const res = await fetch(`${API_URL}/whoami`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // If the backend returns 403, it means the VTU is not in the Master Roster
        if (res.status === 403) {
          throw new Error("NOT_IN_ROSTER");
        }
        throw new Error("AUTH_FAILED");
      }

      const data = await res.json();

      // Redirect based on the renamed roles
      if (data.role === "head") {
        router.replace("/admin");
      } else if (data.role === "coordinator") {
        router.replace("/coordinator");
      } else {
        router.replace("/home");
      }
    } catch (err: any) {
      console.error("Routing error:", err);
      isRouting.current = false; // Reset lock on failure

      if (err.message === "NOT_IN_ROSTER") {
        setError("Access Denied: Your VTU is not registered in the UBA Master Roster.");
        await auth.signOut(); // Only force sign out if they are explicitly banned
      } else {
        setError("Network connection failed. Are you on the same Wi-Fi as the server?");
        // THE FIX: Removed auth.signOut() here so they don't get kicked in a loop!
      }
      
      setIsSigningIn(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!isSigningIn) {
             await routeUserByRole(user);
        }
      } else {
        setLoading(false);
      }
    });

    getRedirectResult(auth).then(result => {
        if(result?.user) routeUserByRole(result.user);
    }).catch(console.error);

    return () => unsubscribe();
  }, [router, API_URL]);

  const handleLogin = async () => {
    if (isSigningIn) return;
    try {
      setIsSigningIn(true);
      setError("");
      setLoading(true); 

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);

      const userEmail = result.user.email || "";

      // 1. HARD DOMAIN CHECK
      if (!userEmail.endsWith("@veltech.edu.in")) {
        await auth.signOut();
        setError("Access Denied: Use your @veltech.edu.in institutional email.");
        setIsSigningIn(false);
        setLoading(false);
        return;
      }

      // 2. BACKEND ROSTER CHECK
      await routeUserByRole(result.user);

    } catch (err) {
      console.error("Popup Error:", err);
      setError("Login failed. Check your connection or popup blocker.");
      setIsSigningIn(false);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-[#FFF9F5] border-t-[#FF5722] rounded-full animate-spin mb-4"></div>
        <p className="font-black text-[10px] uppercase tracking-[0.3em] text-[#FF5722] animate-pulse text-center">
          Initializing UBA Portal
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-white p-4 font-sans">
      <div className="w-full max-w-sm">
        
        {/* LOGO SECTION */}
        <div className="flex flex-col items-center mb-12">
          <div className="relative mb-6">
            <div className="absolute -inset-4 bg-orange-100/50 rounded-full blur-2xl animate-pulse"></div>
            <img 
              src="/uba-logo.png" 
              alt="UBA Logo" 
              className="h-28 w-28 relative object-contain rounded-full border-4 border-white shadow-xl"
            />
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter text-gray-900 uppercase">
            Attendance<span className="text-[#FF5722]">.</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400 mt-2">
            Unnat Bharat Abhiyan
          </p>
        </div>

        {/* LOGIN CARD */}
        <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-2xl shadow-orange-100/50">
          <h2 className="text-center font-black text-xs uppercase tracking-widest text-gray-500 mb-8 underline decoration-[#FF5722] decoration-2 underline-offset-8">
            Identity Verification
          </h2>
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs font-bold rounded-r-xl leading-relaxed">
              {error}
            </div>
          )}

          <button 
            onClick={handleLogin} 
            disabled={isSigningIn} 
            className="w-full group relative flex items-center justify-center gap-3 bg-[#111827] hover:bg-black py-5 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5 group-hover:scale-110 transition-transform" alt="G" />
            <span className="text-white font-black text-xs uppercase tracking-widest">
              {isSigningIn ? "Authorizing..." : "Sign In with Google"}
            </span>
          </button>
          
          <p className="text-center text-[9px] font-bold text-gray-400 mt-8 uppercase leading-loose">
            Authorized strictly for <br/>
            <span className="text-[#FF5722]">Vel Tech University</span> students
          </p>
        </div>

        {/* EXTERNAL LINKS */}
        <div className="mt-12 flex justify-center gap-6 opacity-40 hover:opacity-100 transition-opacity">
           <div className="h-1 w-1 bg-gray-300 rounded-full"></div>
           <div className="h-1 w-1 bg-gray-300 rounded-full"></div>
           <div className="h-1 w-1 bg-gray-300 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}