"use client"

import * as React from "react"
import Link from "next/link"
import { LucideIcon } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { cn } from "@/lib/utils"

export interface BreadcrumbItemData {
  name: string
  path: string
  href: string
  icon: LucideIcon
}

interface ResponsiveBreadcrumbProps {
  items: BreadcrumbItemData[]
  className?: string
}

export function ResponsiveBreadcrumb({ items, className }: ResponsiveBreadcrumbProps) {
  const itemCount = items.length
  
  // For mobile devices, we want to show only the last 2 items and ellipsis if there are more
  const renderMobileBreadcrumb = () => {
    if (itemCount <= 2) {
      // Show all items if 2 or fewer
      return items.map((item, index) => renderBreadcrumbItem(item, index, items.length, true))
    }
    
    if (itemCount === 3) {
      // For 3 items, show first, separator, last two without ellipsis
      return items.map((item, index) => renderBreadcrumbItem(item, index, items.length, true))
    }
    
    // Show first item, ellipsis, and last 2 items (only ellipsize middle items)
    const firstItem = items[0]
    const lastTwoItems = items.slice(-2)
    
    return (
      <>
        {renderBreadcrumbItem(firstItem, 0, items.length, true)}
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {lastTwoItems.map((item, index) => 
          renderBreadcrumbItem(item, items.length - 2 + index, items.length, true)
        )}
      </>
    )
  }
  
  // For desktop, show all items
  const renderDesktopBreadcrumb = () => {
    return items.map((item, index) => renderBreadcrumbItem(item, index, items.length, false))
  }
  
  const renderBreadcrumbItem = (item: BreadcrumbItemData, index: number, total: number, isMobile: boolean) => {
    const isLast = index === total - 1
    const Icon = item.icon
    
    // On mobile, only truncate items that are not in the last 2 positions
    // On desktop, allow longer text but still set reasonable limits
    const shouldTruncate = isMobile && index < total - 2
    const maxWidthClass = shouldTruncate 
      ? "max-w-[80px]" 
      : isMobile 
        ? "max-w-[120px]" 
        : "max-w-[200px]"
    
    return (
      <React.Fragment key={item.path}>
        {index > 0 && <BreadcrumbSeparator />}
        <BreadcrumbItem>
          {isLast ? (
            <BreadcrumbPage>
              <Icon className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className={cn("truncate", maxWidthClass)}>{item.name}</span>
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink href={item.href} className="flex items-center">
              <Icon className="h-4 w-4 mr-1 flex-shrink-0" />
              <span className={cn("truncate", maxWidthClass)}>{item.name}</span>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
      </React.Fragment>
    )
  }
  
  return (
    <Breadcrumb className={cn("mb-4", className)}>
      <BreadcrumbList>
        {/* Mobile view: ellipsize middle items, keep last 2 items readable */}
        <div className="flex items-center sm:hidden">
          {renderMobileBreadcrumb()}
        </div>
        
        {/* Desktop view: show all items with reasonable truncation */}
        <div className="hidden sm:flex sm:items-center">
          {renderDesktopBreadcrumb()}
        </div>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
