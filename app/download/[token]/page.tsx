"use client";

import { useEffect, useMemo, useRef, useState, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download } from 'lucide-react';

interface StatusResp {
  token: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  total: number;
  processed: number;
  createdAt: string;
  expiresAt: string;
  filename?: string;
  ready: boolean;
  error?: string | null;
  downloadUrl?: string | null;
}

export default function DownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number>(Date.now());

  const pollDelay = useMemo(() => (elapsed < 60_000 ? 10_000 : 60_000), [elapsed]);

  useEffect(() => {
    let timer: any;
    let tick: any;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/download/${token}/status`, { cache: 'no-store' });
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        // ignore transient errors
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
    timer = setInterval(fetchStatus, pollDelay);
    tick = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 1000);
    return () => { clearInterval(timer); clearInterval(tick); };
  }, [token, pollDelay]);

  const ready = status?.ready;
  const progress = status && status.total > 0 ? Math.round(((status.processed || 0) / status.total) * 100) : 0;

  return (
    <div className="container mx-auto py-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Preparing Your Download</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>Please wait for your photos to be ready for download. You can come back later to this URL or stay here.</p>
          {!ready ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{status?.status ?? 'Pending'}{status ? ` · ${progress}%` : ''}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <a href={status?.downloadUrl || '#'} className="inline-flex items-center gap-2">
                <Button className="inline-flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Download {status?.filename || 'photos.zip'}
                </Button>
              </a>
              <span className="text-xs text-muted-foreground">Link expires at {status && new Date(status.expiresAt).toLocaleString()}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
