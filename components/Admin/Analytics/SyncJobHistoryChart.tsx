'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"

interface SyncJobData {
  id: string
  status: string
  type: string
  filesProcessed: number
  durationSeconds: number | null
  createdAt: string
}

const statusColors: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  RUNNING: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
}

export function SyncJobHistoryChart({ jobs }: { jobs: SyncJobData[] }) {
  const chartData = jobs
    .filter((j) => j.filesProcessed > 0)
    .slice(0, 20)
    .reverse()
    .map((j, i) => ({
      label: `#${i + 1}`,
      files: j.filesProcessed,
      status: j.status,
    }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync Job History</CardTitle>
        <CardDescription>Recent sync jobs and files processed</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" className="text-xs" tick={{ fill: 'currentColor' }} />
              <YAxis className="text-xs" tick={{ fill: 'currentColor' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Bar dataKey="files" fill="hsl(var(--primary))" name="Files Processed" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Recent Jobs</h4>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {jobs.slice(0, 10).map((job) => (
              <div key={job.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={statusColors[job.status] || ''}>
                    {job.status}
                  </Badge>
                  <span className="text-muted-foreground">{job.type}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{job.filesProcessed} files</span>
                  {job.durationSeconds !== null && <span>{job.durationSeconds}s</span>}
                  <span>{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {jobs.length === 0 && (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            No sync jobs found
          </div>
        )}
      </CardContent>
    </Card>
  )
}
