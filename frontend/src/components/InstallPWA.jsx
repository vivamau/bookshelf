import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function InstallPWA() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Check if iOS
    const isDeviceIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(isDeviceIOS);

    // Check if already in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isStandalone) {
      return; // Standard PWA already installed
    }

    if (isDeviceIOS) {
      // Show prompt for iOS if not in standalone
        // Basic check to see if we've shown it recently to avoid annoyance?
        // For now, just show it once per session if not installed.
        setShowPrompt(true);
    } else {
      // For Android/Chrome
      const handleBeforeInstallPrompt = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowPrompt(true);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] md:hidden animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="bg-card/95 backdrop-blur-xl border border-primary/20 rounded-xl p-4 shadow-2xl flex flex-col gap-3 relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-purple-500" />
        
        <button 
            onClick={() => setShowPrompt(false)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1"
        >
            <X size={16} />
        </button>

        <div className="flex items-start gap-4 pr-6">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                <img src="/icons/icon-512x512.svg" alt="App Icon" className="w-8 h-8 object-contain" />
            </div>
            <div className="flex flex-col">
                <h3 className="font-bold text-foreground">Install Bookshelf</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                    Add to your home screen for the best full-screen reading experience.
                </p>
            </div>
        </div>

        {isIOS ? (
            <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground flex flex-col gap-2 mt-1">
                <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 bg-background rounded border border-border">1</span>
                    <span className="flex items-center gap-1">Tap the <Share size={12} className="text-primary" /> Share button below</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 bg-background rounded border border-border">2</span>
                    <span className="flex items-center gap-1">Select <PlusSquare size={12} className="text-foreground" /> Add to Home Screen</span>
                </div>
            </div>
        ) : (
            <button 
                onClick={handleInstallClick}
                className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-lg text-sm mt-1 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 active:scale-95"
            >
                Install App
            </button>
        )}
      </div>
    </div>
  );
}
