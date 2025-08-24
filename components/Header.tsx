import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SearchBar } from '@/components/SearchBar';
import Link from 'next/link';

interface HeaderProps {
  siteName: string;
}

export function Header({ siteName }: HeaderProps) {
  const t = useTranslations('nav');

  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50 dark:bg-slate-950/80">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg sm:text-2xl font-bold text-primary flex-shrink-0">
            <Link href="/">{siteName}</Link>
          </h1>
          
          {/* Search bar - hidden on mobile, shown on tablet and up */}
          <div className="hidden md:flex flex-1 justify-center max-w-md">
            <SearchBar />
          </div>
          
          <nav className="flex items-center space-x-6 flex-shrink-0">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('albums')}
            </Link>
            <Link href="/favorites" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('favorites')}
            </Link>
            <ThemeToggle />
          </nav>
        </div>
        
        {/* Mobile search bar - shown only on mobile */}
        <div className="md:hidden mt-3">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}
