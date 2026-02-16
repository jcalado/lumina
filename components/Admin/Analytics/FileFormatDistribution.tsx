'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface FormatData {
  name: string
  count: number
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--primary) / 0.7)',
  'hsl(var(--primary) / 0.5)',
  'hsl(var(--primary) / 0.3)',
  'hsl(210 40% 60%)',
  'hsl(210 40% 45%)',
  'hsl(210 40% 30%)',
  'hsl(210 20% 50%)',
]

function DonutChart({ data, title }: { data: FormatData[]; title: string }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
        <p className="text-sm">No {title.toLowerCase()} data</p>
      </div>
    )
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-center mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="count"
            nameKey="name"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function FileFormatDistribution({
  photoFormats,
  videoCodecs,
}: {
  photoFormats: FormatData[]
  videoCodecs: FormatData[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>File Format Distribution</CardTitle>
        <CardDescription>Breakdown by file format and video codec</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DonutChart data={photoFormats} title="Photo Formats" />
          <DonutChart data={videoCodecs} title="Video Codecs" />
        </div>
      </CardContent>
    </Card>
  )
}
