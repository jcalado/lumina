import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Suspense } from 'react';
import { FavoritesProvider } from '@/contexts/FavoritesContext';
import { DownloadSelectionProvider } from '@/contexts/DownloadSelectionContext';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import SettingsShell from '@/components/SettingsShell';
import SettingsFallback from '@/components/SettingsFallback';

const inter = Inter({ subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  // Avoid hard build-time DB dependency; resolve at runtime with fallback
  try {
    const { connection } = await import('next/server');
    await connection();
    const { getSiteSettings } = await import('@/lib/settings');
    const siteSettings = await getSiteSettings();
    return {
      title: siteSettings.siteName,
      description:
        'A beautiful photo gallery for organizing and sharing your photography',
      keywords: ['photography', 'gallery', 'photos', 'albums'],
    };
  } catch {
    return {
      title: 'Lumina',
      description:
        'A beautiful photo gallery for organizing and sharing your photography',
      keywords: ['photography', 'gallery', 'photos', 'albums'],
    };
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider
          defaultTheme="system"
          storageKey="lumina-ui-theme"
        >
          <AuthProvider>
            <FavoritesProvider>
              <DownloadSelectionProvider>
                <NextIntlClientProvider messages={messages}>
                <Suspense fallback={<SettingsFallback />}>
                  <SettingsShell>
                    {children}
                  </SettingsShell>
                </Suspense>
                <Toaster />
              </NextIntlClientProvider>
              </DownloadSelectionProvider>
            </FavoritesProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
