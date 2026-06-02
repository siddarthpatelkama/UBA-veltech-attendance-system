import Link from 'next/link';

export const metadata = {
  title: 'UBA Attendance System | Universal Control',
  description: 'Enterprise-grade, offline-first biometric and QR attendance tracking system.',
  verification: {
    google: 'SboLln7KFZdT8XRI28Gm5Nax4pJRWZcYcCeb1rDI4Y8', 
  },
};

export default function PublicLandingPage() {
  return (
    <main className="min-h-screen bg-[#0f1115] text-white flex flex-col font-sans">
      {/* Navigation Bar */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-800 bg-[#0f1115]">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-xl tracking-tight">UBA Attendance System</span>
        </div>
        <Link 
          href="/portal" 
          className="text-sm font-medium hover:text-gray-300 transition-colors bg-gray-800 px-4 py-2 rounded-md"
        >
          Sign in
        </Link>
      </header>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-8 mt-[-5vh]">
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
          Universal Control
        </h1>
        
        <p className="text-xl text-gray-400 max-w-2xl">
          The official UBA field operation and campus attendance ecosystem. 
          Hardware-locked, heavily encrypted, and offline-ready.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-6">
          <Link 
            href="/portal" 
            className="px-8 py-3 bg-[#FF5722] hover:bg-[#E64A19] text-white font-bold rounded-md transition-all duration-300 shadow-[0_0_15px_rgba(255,87,34,0.4)]"
          >
            Launch Portal
          </Link>
          <Link 
            href="https://github.com/siddarthpatelkama/UBA-veltech-attendance-system" 
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3 bg-transparent border border-gray-600 hover:bg-gray-800 text-white font-medium rounded-md transition-all duration-300"
          >
            View Documentation
          </Link>
        </div>
      </div>
    </main>
  );
}
