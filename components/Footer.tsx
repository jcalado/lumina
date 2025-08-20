import Link from 'next/link';
import { getSiteSettings } from '@/lib/settings';

interface FooterLink {
  name: string;
  url: string;
}

interface FooterProps {
  className?: string;
}

export async function Footer({ className = '' }: FooterProps) {
  const settings = await getSiteSettings();
  
  let links: FooterLink[] = [];
  try {
    links = JSON.parse(settings.footerLinks || '[]');
  } catch (error) {
    console.error('Error parsing footer links:', error);
    // Use default links
    links = [
      { name: "Privacy Policy", url: "/privacy" },
      { name: "Terms of Service", url: "/terms" },
      { name: "Contact", url: "/contact" }
    ];
  }

  const copyright = settings.footerCopyright || `© ${new Date().getFullYear()} Lumina Gallery. All rights reserved.`;

  return (
    <footer className={`border-t bg-background mt-16 ${className}`}>
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Copyright */}
          <div className="text-sm text-muted-foreground">
            {copyright}
          </div>

          {/* Links */}
          {links.length > 0 && (
            <div className="flex flex-wrap gap-6">
              {links.map((link, index) => (
                <Link
                  key={index}
                  href={link.url}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
