import { connection } from 'next/server';
import { ThemeCustomizer } from '@/components/ThemeCustomizer';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { getSiteSettings } from '@/lib/settings';

export default async function SettingsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const siteSettings = await getSiteSettings();

  return (
    <div className="min-h-screen bg-background">
      <ThemeCustomizer accentColor={siteSettings.accentColor} />
      <Header siteName={siteSettings.siteName} />
      <main className="container mx-auto px-4 py-8">{children}</main>
      <Footer />
    </div>
  );
}

