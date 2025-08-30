'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BarChart3, AlertCircle, CheckCircle, Clock, Play, Pause, Square, Timer, TrendingUp } from 'lucide-react';

interface ProcessingStatusProps {
  settings: {
    faceRecognitionEnabled: boolean;
  };
  status: any;
  lastJobStatus: string | null;
  currentJob?: any;
}

function formatTime(ms: number): string {
  if (ms <= 0) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function ProcessingStatus({ settings, status, lastJobStatus, currentJob }: ProcessingStatusProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Processing Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!settings.faceRecognitionEnabled ? (
          <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Face Recognition Disabled
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-300">
                Enable face recognition in the settings tab to start processing photos
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">
                  System Ready
                </p>
                <p className="text-sm text-green-600 dark:text-green-300">
                  Face recognition is enabled and ready to process photos
                </p>
              </div>
            </div>

            {currentJob && currentJob.status === 'RUNNING' && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Play className="h-5 w-5 text-blue-600" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-blue-800 dark:text-blue-200">
                        Processing Photos
                      </span>
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        {currentJob.progress}%
                      </Badge>
                    </div>
                    <Progress value={currentJob.progress} className="w-full mb-3" />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-blue-600" />
                        <span className="text-blue-700 dark:text-blue-300">
                          Elapsed: {formatTime(currentJob.elapsedTimeMs || 0)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                        <span className="text-blue-700 dark:text-blue-300">
                          ETA: {formatTime(currentJob.estimatedTimeRemainingMs || 0)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                      {currentJob.processedPhotos || 0} of {currentJob.totalPhotos || 0} photos processed
                    </div>
                  </div>
                </div>
              </div>
            )}

            {status && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Play className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-800 dark:text-blue-200">Active Jobs</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">{status.activeJobs || 0}</p>
                </div>

                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-orange-600" />
                    <span className="font-medium text-orange-800 dark:text-orange-200">Queued Jobs</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-600">{status.queuedJobs || 0}</p>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-200">Completed Today</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{status.completedToday || 0}</p>
                </div>
              </div>
            )}

            {lastJobStatus && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-gray-600" />
                  <span className="font-medium text-gray-800 dark:text-gray-200">Last Job Status</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">{lastJobStatus}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
