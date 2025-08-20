import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { FavoritesProvider } from '@/contexts/FavoritesContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Lumina Photo Gallery',
  description: 'A beautiful photo gallery for organizing and sharing your photography',
  keywords: ['photography', 'gallery', 'photos', 'albums'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <FavoritesProvider>
          <div className="min-h-screen bg-background">
            <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
              <div className="container mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold text-primary">
                    Lumina Gallery
                  </h1>
                  <nav className="flex items-center space-x-6">
                    <a href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                      Albums
                    </a>
                    <a href="/favorites" className="text-muted-foreground hover:text-foreground transition-colors">
                      Favorites
                    </a>
                  </nav>
                </div>
              </div>
            </header>
            <main className="container mx-auto px-4 py-8">
              {children}
            </main>
          </div>
        </FavoritesProvider>
      </body>
    </html>
  );
}
