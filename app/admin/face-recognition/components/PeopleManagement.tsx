'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Search,
  Hash,
  SortAsc,
  SortDesc,
  Calendar,
  CheckCircle,
  X,
  ChevronDown,
  Eye,
  Trash2,
  UserPlus
} from 'lucide-react';

interface Person {
  id: string;
  name: string;
  confirmed: boolean;
  faceCount: number;
  previewFace?: {
    id: string;
    confidence: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface PeopleManagementProps {
  people: Person[];
  selectedPeople: Set<string>;
  peopleLoading: boolean;
  peopleGridLoading: boolean;
  peopleSearch: string;
  peopleSort: 'default' | 'alpha' | 'face_count_desc' | 'face_count_asc' | 'created_desc' | 'created_asc';
  peopleFilter: 'all' | 'pending' | 'unnamed' | 'single_face';
  showPending: boolean;
  showUnnamed: boolean;
  showSingleFace: boolean;
  page: number;
  limit: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  } | null;
  deletingAllPeople: boolean;
  onPeopleSearchChange: (value: string) => void;
  onPeopleSortChange: (value: 'default' | 'alpha' | 'face_count_desc' | 'face_count_asc' | 'created_desc' | 'created_asc') => void;
  onPeopleFilterChange: (value: 'all' | 'pending' | 'unnamed' | 'single_face') => void;
  onToggleShowPending: () => void;
  onToggleShowUnnamed: () => void;
  onToggleShowSingleFace: () => void;
  onClearFilters: () => void;
  onTogglePersonSelection: (personId: string) => void;
  onLoadPeople: () => void;
  onMergeSelectedPeople: () => void;
  onDeleteAllPeople: () => void;
  onLoadPersonDetails: (personId: string) => void;
  onDeletePerson: (personId: string, personName: string) => void;
  onPageChange: (newPage: number) => void;
  onLimitChange: (newLimit: number) => void;
}

export function PeopleManagement({
  people,
  selectedPeople,
  peopleLoading,
  peopleGridLoading,
  peopleSearch,
  peopleSort,
  peopleFilter,
  showPending,
  showUnnamed,
  showSingleFace,
  page,
  limit,
  pagination,
  deletingAllPeople,
  onPeopleSearchChange,
  onPeopleSortChange,
  onPeopleFilterChange,
  onToggleShowPending,
  onToggleShowUnnamed,
  onToggleShowSingleFace,
  onClearFilters,
  onTogglePersonSelection,
  onLoadPeople,
  onMergeSelectedPeople,
  onDeleteAllPeople,
  onLoadPersonDetails,
  onDeletePerson,
  onPageChange,
  onLimitChange,
}: PeopleManagementProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            People Management
            <Badge variant="secondary">{pagination?.total || people.length} people</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(limit)} onValueChange={(value) => onLimitChange(parseInt(value))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12</SelectItem>
                <SelectItem value="24">24</SelectItem>
                <SelectItem value="48">48</SelectItem>
                <SelectItem value="96">96</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">per page</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter people by name..."
              value={peopleSearch}
              onChange={(e) => onPeopleSearchChange(e.target.value)}
              className="pl-9 max-w-xs"
            />
          </div>

          {/* Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Filters
                {(showPending || showUnnamed || showSingleFace) && (
                  <Badge variant="secondary" className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-xs">
                    {[showPending, showUnnamed, showSingleFace].filter(Boolean).length}
                  </Badge>
                )}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Filter People</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onToggleShowPending}
                className={showPending ? 'bg-accent' : ''}
              >
                <CheckCircle className={`h-4 w-4 mr-2 ${showPending ? 'text-primary' : 'text-muted-foreground'}`} />
                Show only pending
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onToggleShowUnnamed}
                className={showUnnamed ? 'bg-accent' : ''}
              >
                <CheckCircle className={`h-4 w-4 mr-2 ${showUnnamed ? 'text-primary' : 'text-muted-foreground'}`} />
                Show only unnamed
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onToggleShowSingleFace}
                className={showSingleFace ? 'bg-accent' : ''}
              >
                <CheckCircle className={`h-4 w-4 mr-2 ${showSingleFace ? 'text-primary' : 'text-muted-foreground'}`} />
                Show only 1 face
              </DropdownMenuItem>
              {(showPending || showUnnamed || showSingleFace) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onClearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Clear all filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <SortAsc className="h-4 w-4" />
                Sort
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Sort People By</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onPeopleSortChange('default')} className={peopleSort === 'default' ? 'bg-accent' : ''}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Default (Confirmed first)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPeopleSortChange('alpha')} className={peopleSort === 'alpha' ? 'bg-accent' : ''}>
                <SortAsc className="h-4 w-4 mr-2" />
                Name (A-Z)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPeopleSortChange('face_count_desc')} className={peopleSort === 'face_count_desc' ? 'bg-accent' : ''}>
                <SortDesc className="h-4 w-4 mr-2" />
                Most Faces First
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPeopleSortChange('face_count_asc')} className={peopleSort === 'face_count_asc' ? 'bg-accent' : ''}>
                <SortAsc className="h-4 w-4 mr-2" />
                Fewest Faces First
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPeopleSortChange('created_desc')} className={peopleSort === 'created_desc' ? 'bg-accent' : ''}>
                <Calendar className="h-4 w-4 mr-2" />
                Newest First
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPeopleSortChange('created_asc')} className={peopleSort === 'created_asc' ? 'bg-accent' : ''}>
                <Calendar className="h-4 w-4 mr-2" />
                Oldest First
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={onMergeSelectedPeople} variant="destructive" size="sm" disabled={selectedPeople.size < 2}>
            Merge Selected ({selectedPeople.size})
          </Button>

          {/* Bulk Operations */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deletingAllPeople}>
                {deletingAllPeople ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete All People
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete All People?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete all {people.length} people and unassign all their faces.
                  The faces will become unassigned and can be processed again to create new people.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDeleteAllPeople} className="bg-destructive hover:bg-destructive/90">
                  Delete All People
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button onClick={onLoadPeople} variant="outline" size="sm" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* People Grid */}
        <div className="relative">
          {peopleGridLoading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Loading page...</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {people.map((person) => (
              <Card key={person.id} className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={() => onLoadPersonDetails(person.id)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium truncate">{person.name}</h4>
                    <Checkbox
                      checked={selectedPeople.has(person.id)}
                      onChange={() => {}}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div className="flex items-start gap-3">
                    {person.previewFace && (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        <img
                          src={`/api/faces/${person.previewFace.id}/serve`}
                          alt={`${person.name} preview`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {person.confirmed ? (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <UserPlus className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {person.faceCount} face{person.faceCount !== 1 ? 's' : ''}
                      </p>
                      {person.previewFace && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Confidence: {Math.round(person.previewFace.confidence * 100)}%
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePerson(person.id, person.name);
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} people
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => onPageChange(pagination.page - 1)}
              >
                Prev
              </Button>
              <Select
                value={String(pagination.page)}
                onValueChange={(value) => onPageChange(parseInt(value))}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <SelectItem key={pageNum} value={String(pageNum)}>
                      {pageNum}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => onPageChange(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
