import { connection } from 'next/server';
import { ThemeCustomizer } from '@/components/ThemeCustomizer';
import { getSiteSettings } from '@/lib/settings';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const siteSettings = await getSiteSettings();
  return (
    <div className="min-h-screen bg-background">
      <ThemeCustomizer accentColor={siteSettings.accentColor} />
      {children}
    </div>
  );
}
