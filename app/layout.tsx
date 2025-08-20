import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getSiteSettings } from '@/lib/settings';

const inter = Inter({ subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const siteSettings = await getSiteSettings();
  
  return {
    title: siteSettings.siteName,
    description: 'A beautiful photo gallery for organizing and sharing your photography',
    keywords: ['photography', 'gallery', 'photos', 'albums'],
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  const siteSettings = await getSiteSettings();

  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider
          defaultTheme="system"
          storageKey="lumina-ui-theme"
        >
          <AuthProvider>
            <FavoritesProvider>
              <NextIntlClientProvider messages={messages}>
                <div className="min-h-screen bg-background">
                  <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50 dark:bg-slate-950/80">
                    <div className="container mx-auto px-4 py-4">
                      <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-primary">
                          {siteSettings.siteName}
                        </h1>
                        <nav className="flex items-center space-x-6">
                          <a href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                            Albums
                          </a>
                          <a href="/favorites" className="text-muted-foreground hover:text-foreground transition-colors">
                            Favorites
                          </a>
                          <ThemeToggle />
                        </nav>
                      </div>
                    </div>
                  </header>
                  <main className="container mx-auto px-4 py-8">
                    {children}
                  </main>
                </div>
                <Toaster />
              </NextIntlClientProvider>
            </FavoritesProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
