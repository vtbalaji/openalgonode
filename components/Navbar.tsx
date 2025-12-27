/**
 * TradeIdea-style Top Navigation
 * Clean, professional navigation with logo and auth buttons
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 sm:space-x-3 hover:opacity-80 transition-opacity min-w-0">
            <Image
              src="/logo-icon.svg"
              alt="Logo"
              width={40}
              height={40}
              className="w-8 sm:w-10 h-8 sm:h-10 flex-shrink-0"
            />
            <span className="text-sm sm:text-lg md:text-2xl font-bold text-gray-900 whitespace-nowrap truncate">
              Algo Trading Platform
            </span>
          </Link>

          {/* Auth Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 md:space-x-4 ml-4">
            {user ? (
              <>
                <Link
                  href="/"
                  className="text-xs sm:text-sm md:text-base text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 text-xs sm:text-sm md:text-base text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 sm:px-4 md:px-6 py-1.5 sm:py-2 text-xs sm:text-sm md:text-base text-gray-700 hover:text-gray-900 font-medium transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/login?signup=true"
                  className="px-3 sm:px-4 md:px-6 py-1.5 sm:py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm md:text-base font-medium rounded-lg transition-colors shadow-sm"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
