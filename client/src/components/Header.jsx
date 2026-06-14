import React from 'react';
import ThemeToggle from './ThemeToggle';
import { Share2, Shield } from 'lucide-react';

export default function Header() {
  return (
    <header className="w-full max-w-4xl mx-auto flex items-center justify-between py-6 px-4 md:px-0">
      <div className="flex items-center gap-3 select-none">
        <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-accent text-white shadow-md glow-effect">
          <Share2 className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main flex items-center gap-2">
            P2P Web Share
            <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase bg-accent/15 text-accent px-2 py-0.5 rounded-full border border-accent/20">
              <Shield className="w-3 h-3 inline" /> E2EE
            </span>
          </h1>
          <p className="text-xs text-text-muted">Direct browser-to-browser file transfer</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}
