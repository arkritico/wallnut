"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function MobileNav({ isOpen, onClose, children }: MobileNavProps) {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-50 md:hidden flex flex-col animate-slide-in-left">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Menu</span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {children}
        </nav>
      </div>
    </>
  );
}

/** Consistent nav link style for the mobile drawer. */
export function MobileNavLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]"
    >
      {children}
    </button>
  );
}
