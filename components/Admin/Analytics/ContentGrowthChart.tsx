'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ContentGrowthData {
  month: string
  photos: number
  videos: number
}

export function ContentGrowthChart({ data }: { data: ContentGrowthData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Content Growth</CardTitle>
        <CardDescription>Photos and videos added per month</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" tick={{ fill: 'currentColor' }} />
              <YAxis className="text-xs" tick={{ fill: 'currentColor' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Legend />
              <Bar dataKey="photos" fill="hsl(var(--primary))" name="Photos" radius={[2, 2, 0, 0]} />
              <Bar dataKey="videos" fill="hsl(var(--primary) / 0.5)" name="Videos" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No content growth data available
          </div>
        )}
      </CardContent>
    </Card>
  )
}
