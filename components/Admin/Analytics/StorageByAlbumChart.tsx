'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface StorageByAlbumData {
  name: string
  sizeBytes: number
  sizeFormatted: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function StorageByAlbumChart({ data }: { data: StorageByAlbumData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage by Album</CardTitle>
        <CardDescription>Top 10 albums by total file size</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                className="text-xs"
                tick={{ fill: 'currentColor' }}
                tickFormatter={(v) => formatBytes(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                className="text-xs"
                tick={{ fill: 'currentColor' }}
                width={120}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value) => [formatBytes(value as number), 'Size']}
              />
              <Bar dataKey="sizeBytes" fill="hsl(var(--primary))" name="Size" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No storage data available
          </div>
        )}
      </CardContent>
    </Card>
  )
}
