import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/components/ThemeToggle';

interface HeaderProps {
  siteName: string;
}

export function Header({ siteName }: HeaderProps) {
  const t = useTranslations('nav');

  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50 dark:bg-slate-950/80">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">
            {siteName}
          </h1>
          <nav className="flex items-center space-x-6">
            <a href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('albums')}
            </a>
            <a href="/favorites" className="text-muted-foreground hover:text-foreground transition-colors">
              {t('favorites')}
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}
