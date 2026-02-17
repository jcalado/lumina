import { Suspense } from 'react';
import SettingsShell from '@/components/SettingsShell';
import SettingsFallback from '@/components/SettingsFallback';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsShell>{children}</SettingsShell>
    </Suspense>
  );
}
