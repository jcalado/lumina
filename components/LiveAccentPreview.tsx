'use client';

import { useEffect } from 'react';

interface LiveAccentPreviewProps {
  accentColor: string;
}

export function LiveAccentPreview({ accentColor }: LiveAccentPreviewProps) {
  useEffect(() => {
    // Apply the accent color temporarily to the admin page for live preview
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
    
    // Apply preview styles
    document.documentElement.style.setProperty('--primary', `${hsl.h} ${hsl.s}% ${hsl.l}%`);
    document.documentElement.style.setProperty('--primary-foreground', `${hsl.h} ${hsl.s}% ${hsl.l > 50 ? 10 : 90}%`);
    document.documentElement.style.setProperty('--accent', `${hsl.h} ${Math.max(hsl.s - 10, 0)}% ${Math.min(hsl.l + 5, 95)}%`);
    document.documentElement.style.setProperty('--accent-foreground', `${hsl.h} ${hsl.s}% ${hsl.l > 50 ? 10 : 90}%`);
    document.documentElement.style.setProperty('--ring', `${hsl.h} ${hsl.s}% ${hsl.l}%`);

  }, [accentColor]);

  return null;
}
