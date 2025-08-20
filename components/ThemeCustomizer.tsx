'use client';

import { useEffect } from 'react';

interface ThemeCustomizerProps {
  accentColor: string;
}

export function ThemeCustomizer({ accentColor }: ThemeCustomizerProps) {
  useEffect(() => {
    // Convert hex color to HSL for better CSS custom property support
    const hexToHsl = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }

      return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
      };
    };

    const hsl = hexToHsl(accentColor);
    
    // Set CSS custom properties for the accent color
    document.documentElement.style.setProperty('--primary', `${hsl.h} ${hsl.s}% ${hsl.l}%`);
    document.documentElement.style.setProperty('--primary-foreground', `${hsl.h} ${hsl.s}% ${hsl.l > 50 ? 10 : 90}%`);
    
    // Create variations of the accent color
    document.documentElement.style.setProperty('--accent', `${hsl.h} ${Math.max(hsl.s - 10, 0)}% ${Math.min(hsl.l + 5, 95)}%`);
    document.documentElement.style.setProperty('--accent-foreground', `${hsl.h} ${hsl.s}% ${hsl.l > 50 ? 10 : 90}%`);
    
    // Ring color for focus states
    document.documentElement.style.setProperty('--ring', `${hsl.h} ${hsl.s}% ${hsl.l}%`);
    
    return () => {
      // Reset to default values when component unmounts
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-foreground');
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-foreground');
      document.documentElement.style.removeProperty('--ring');
    };
  }, [accentColor]);

  return null; // This component doesn't render anything
}
