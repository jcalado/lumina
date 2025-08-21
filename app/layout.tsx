import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ThemeCustomizer } from '@/components/ThemeCustomizer';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
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
          <ThemeCustomizer accentColor={siteSettings.accentColor} />
          <AuthProvider>
            <FavoritesProvider>
              <NextIntlClientProvider messages={messages}>
                <div className="min-h-screen bg-background">
                  <Header siteName={siteSettings.siteName} />
                  <main className="container mx-auto px-4 py-8">
                    {children}
                  </main>
                  <Footer />
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
