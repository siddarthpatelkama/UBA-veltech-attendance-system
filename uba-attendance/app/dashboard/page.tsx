'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface StudentData {
  id: string;
  name: string;
  vtuNumber: string;
  createdAt: string;
}

export default function DashboardPage() {
  const [student, setStudent] = useState<StudentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if student exists in localStorage
    const studentData = localStorage.getItem('student');
    
    if (studentData) {
      try {
        const parsed = JSON.parse(studentData);
        setStudent(parsed);
      } catch (error) {
        console.error('Error parsing student data:', error);
        localStorage.removeItem('student');
        router.push('/register');
      }
    } else {
      router.push('/register');
    }
    
    setIsLoading(false);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('student');
    router.push('/register');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-green-50 font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-orange-500"></div>
      </div>
    );
  }

  if (!student) {
    return null; // Will redirect
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-green-50 font-sans p-4">
      <main className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-lg border-t-4 border-orange-500">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">UBA</div>
            <h1 className="text-2xl font-bold text-gray-800">
              Student Dashboard
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 shadow"
          >
            Logout
          </button>
        </div>

        <div className="space-y-6">
          {/* Student Information Card */}
          <div className="rounded-xl border-l-4 border-orange-500 bg-orange-50 p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-800">
              Student Information
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-bold text-gray-600">
                  Name
                </label>
                <p className="mt-1 text-lg text-gray-800">{student.name}</p>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-600">
                  VTU Number
                </label>
                <p className="mt-1 text-lg font-mono text-orange-600">
                  {student.vtuNumber}
                </p>
              </div>
              <div>
                <label className="text-sm font-bold text-gray-600">
                  Student ID
                </label>
                <p className="mt-1 text-sm font-mono text-gray-600">
                  {student.id}
                </p>
              </div>
              {student.createdAt && (
                <div>
                  <label className="text-sm font-bold text-gray-600">
                    Registered On
                  </label>
                  <p className="mt-1 text-sm text-gray-600">
                    {new Date(student.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Placeholder for future features */}
          <div className="rounded-xl border-l-4 border-green-600 bg-green-50 p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-800">
              Attendance
            </h2>
            <p className="text-gray-700">
              Attendance features will be available here.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

