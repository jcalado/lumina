'use client'

import { ContentGrowthChart } from "@/components/Admin/Analytics/ContentGrowthChart"
import { MediaTimelineChart } from "@/components/Admin/Analytics/MediaTimelineChart"
import { StorageByAlbumChart } from "@/components/Admin/Analytics/StorageByAlbumChart"
import { FileFormatDistribution } from "@/components/Admin/Analytics/FileFormatDistribution"
import { SyncJobHistoryChart } from "@/components/Admin/Analytics/SyncJobHistoryChart"

interface AnalyticsChartsProps {
  contentGrowth: { month: string; photos: number; videos: number }[]
  mediaTimeline: { month: string; count: number }[]
  storageByAlbum: { name: string; sizeBytes: number; sizeFormatted: string }[]
  photoFormats: { name: string; count: number }[]
  videoCodecs: { name: string; count: number }[]
  syncJobHistory: {
    id: string
    status: string
    type: string
    filesProcessed: number
    durationSeconds: number | null
    createdAt: string
  }[]
}

export function AnalyticsCharts({
  contentGrowth,
  mediaTimeline,
  storageByAlbum,
  photoFormats,
  videoCodecs,
  syncJobHistory,
}: AnalyticsChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ContentGrowthChart data={contentGrowth} />
      <MediaTimelineChart data={mediaTimeline} />
      <StorageByAlbumChart data={storageByAlbum} />
      <FileFormatDistribution photoFormats={photoFormats} videoCodecs={videoCodecs} />
      <div className="lg:col-span-2">
        <SyncJobHistoryChart jobs={syncJobHistory} />
      </div>
    </div>
  )
}
