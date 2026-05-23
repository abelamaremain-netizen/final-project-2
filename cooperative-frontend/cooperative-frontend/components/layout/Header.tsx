'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getTimeGreeting = () => {
    const hour = currentTime.getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  };

  return (
    <header className="relative h-16 flex items-center justify-between px-6 flex-shrink-0">
      <div className="absolute inset-0 bg-white/80 backdrop-blur-xl border-b border-gray-200/60"></div>
      <div className="relative z-10 flex items-center justify-between w-full">
        {/* Left: Greeting */}
        <div>
          <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>
            {mounted ? `${getTimeGreeting()}, ${user?.fullName?.split(' ')[0] || user?.username || 'User'}` : ''}
          </h2>
          <p className="text-xs text-gray-500">
            {mounted ? currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
          </p>
        </div>

        {/* Right: User Actions */}
        <div className="flex items-center gap-3">
          {/* User Info */}
          <div
            onClick={() => router.push('/dashboard/profile')}
            className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200/60 bg-white/50 backdrop-blur-sm hover:bg-white hover:shadow-lg cursor-pointer transition-all duration-300 group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0A2E5C] to-[#00B8D4] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-xs" style={{ fontFamily: 'Poppins' }}>
                {mounted ? (user?.fullName?.split(' ').map((n: string) => n[0]).join('') || user?.username?.[0]?.toUpperCase() || 'U') : ''}
              </span>
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-semibold text-gray-900 leading-tight" style={{ fontFamily: 'Poppins' }}>
                {mounted ? (user?.fullName || user?.username) : ''}
              </p>
              <p className="text-xs text-gray-500 leading-tight">
                {mounted ? (user?.roles?.[0]?.replace(/_/g, ' ') || 'User') : ''}
              </p>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200/60 bg-red-50/50 text-sm font-medium text-red-600 hover:bg-red-100 hover:border-red-300 hover:shadow-md transition-all duration-300 group"
          >
            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
