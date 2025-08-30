'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import { FaceRecognitionSettings } from '@/components/Admin/FaceRecognitionSettings';
import { PersonDetail } from '@/components/Admin/PersonDetail';
import { AlbumTree } from './components/AlbumTree';
import { ProcessingStatus } from './components/ProcessingStatus';
import { ProcessingControls } from './components/ProcessingControls';
import { PeopleManagement } from './components/PeopleManagement';
import { UnassignedFaces } from './components/UnassignedFaces';
import {
  Eye,
  Play,
  Pause,
  Square,
  Users,
  BarChart3,
  Settings as SettingsIcon,
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  UserPlus,
  Grid3X3,
  Trash2,
  X,
  ChevronDown,
  SortAsc,
  SortDesc,
  Calendar,
  Hash,
  Cpu,
  FolderOpen,
  ChevronRight
} from 'lucide-react';

interface PhotoThumbnail {
  id: string;
  photoId: string;
  size: string;
  s3Key: string;
  width: number;
  height: number;
}

interface Photo {
  id: string;
  filename: string;
  thumbnails: PhotoThumbnail[];
  albumId: string;
  albumSlug: string;
}

interface Face {
  id: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  photo: Photo;
  personId?: string;
}

interface FaceRecognitionSettings {
  faceRecognitionEnabled: boolean;
  faceRecognitionPublicEnabled: boolean;
  faceRecognitionBatchSize: number;
  faceRecognitionParallelProcessing: number;
  faceRecognitionConfidenceThreshold: number;
  faceRecognitionSimilarityThreshold: number;
  peoplePageEnabled: boolean;
}

interface Person {
  id: string;
  name: string;
  confirmed: boolean;
  faceCount: number;
  previewFace?: Face;
  createdAt: string;
  updatedAt: string;
  faces: Face[];
}

interface UnassignedFace {
  id: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  photo: {
    id: string;
    filename: string;
    thumbnails: Array<{
      id: string;
      photoId: string;
      size: string;
      s3Key: string;
      width: number;
      height: number;
    }>;
  };
  ignored?: boolean;
}

interface AlbumTreeNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  totalPhotos: number;
  unprocessedPhotos: number;
  depth: number;
  children: AlbumTreeNode[];
}

export default function FaceRecognitionAdminPage() {
  const [settings, setSettings] = useState<FaceRecognitionSettings>({
    faceRecognitionEnabled: false,
    faceRecognitionPublicEnabled: false,
    faceRecognitionBatchSize: 4,
    faceRecognitionParallelProcessing: 4,
    faceRecognitionConfidenceThreshold: 0.5,
    faceRecognitionSimilarityThreshold: 0.7,
    peoplePageEnabled: false,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleGridLoading, setPeopleGridLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  } | null>(null);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [peopleSort, setPeopleSort] = useState<'default' | 'alpha' | 'face_count_desc' | 'face_count_asc' | 'created_desc' | 'created_asc'>('default');
  const [peopleFilter, setPeopleFilter] = useState<'all' | 'pending' | 'unnamed' | 'single_face'>('all');
  const [showPending, setShowPending] = useState(false);
  const [showUnnamed, setShowUnnamed] = useState(false);
  const [showSingleFace, setShowSingleFace] = useState(false);
  const [lastJobStatus, setLastJobStatus] = useState<string | null>(null);
  const [unassignedFaces, setUnassignedFaces] = useState<UnassignedFace[]>([]);
  const [originalUnassignedFaces, setOriginalUnassignedFaces] = useState<UnassignedFace[] | null>(null);
  const [showingSimilar, setShowingSimilar] = useState(false);
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [unassignedLimit, setUnassignedLimit] = useState(48);
  const [unassignedPagination, setUnassignedPagination] = useState<any | null>(null);
  const [selectedFaces, setSelectedFaces] = useState<Set<string>>(new Set());
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  // New state variables for bulk operations
  const [deletingAllPeople, setDeletingAllPeople] = useState(false);
  const [deletingUnassignedFaces, setDeletingUnassignedFaces] = useState(false);
  const [processingUnassigned, setProcessingUnassigned] = useState(false);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.45);
  const [processMode, setProcessMode] = useState<'create_new' | 'assign_existing' | 'both'>('both');
  const [groupingLimit, setGroupingLimit] = useState<number>(500);
  const [groupingRandomize, setGroupingRandomize] = useState<boolean>(false);
  const [groupingMaxComparisons, setGroupingMaxComparisons] = useState<number>(50000);
  const [groupingPreCluster, setGroupingPreCluster] = useState<boolean>(false);

  // New state variables for face processing modes
  const [processingMode, setProcessingMode] = useState<'new_only' | 'reprocess_all'>('new_only');
  const [isProcessing, setIsProcessing] = useState(false);
  const [photoStats, setPhotoStats] = useState<{
    total: number;
    processed: number;
    unprocessed: number;
    percentage: number;
  } | null>(null);

  const [creatingPerson, setCreatingPerson] = useState(false);
  const [deletingPerson, setDeletingPerson] = useState<string | null>(null);
  const [assigneePersonId, setAssigneePersonId] = useState<string | null>(null);
  const [assigningToPerson, setAssigningToPerson] = useState(false);
  const [personQuery, setPersonQuery] = useState('');
  const [assigneeResults, setAssigneeResults] = useState<Person[]>([]);
  const [assigneeSearching, setAssigneeSearching] = useState(false);
  const assigneeDebounce = useRef<number | null>(null);
  const peopleSearchDebounce = useRef<number | null>(null);
  const personNameInputRef = useRef<HTMLInputElement | null>(null);
  const [similarFilterThreshold, setSimilarFilterThreshold] = useState(0.7);

  // Album selection state
  const [availableAlbums, setAvailableAlbums] = useState<Array<{
    id: string;
    name: string;
    slug: string;
    path: string;
    totalPhotos: number;
    unprocessedPhotos: number;
    depth: number;
    children: any[];
  }>>([]);
  const [selectedAlbumIds, setSelectedAlbumIds] = useState<Set<string>>(new Set());
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());

  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
    loadStatus();
    loadPeople();
    loadUnassignedFaces();
    loadPhotoStats();
    loadAlbums();
  }, []);

  // Reload people when page or limit change
  useEffect(() => {
    loadPeople(undefined, true); // Mark as page change
  }, [page, limit]);

  // Debounced reload when peopleSearch, peopleSort, or filters change
  useEffect(() => {
    if (peopleSearchDebounce.current) window.clearTimeout(peopleSearchDebounce.current);
    peopleSearchDebounce.current = window.setTimeout(() => {
      loadPeople(1);
    }, 300);

    return () => {
      if (peopleSearchDebounce.current) window.clearTimeout(peopleSearchDebounce.current);
    };
  }, [peopleSearch, peopleSort, showPending, showUnnamed, showSingleFace]);

  // Poll status when job is running
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (status?.status === 'running') {
      interval = setInterval(() => {
        loadStatus();
      }, 2000); // Poll every 2 seconds
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status?.status]);

  // Focus the create person input when faces are selected
  useEffect(() => {
    if (selectedFaces.size > 0 && personNameInputRef.current) {
      personNameInputRef.current.focus();
      personNameInputRef.current.select();
    }
  }, [selectedFaces.size]);

  // Reload unassigned faces when page or limit change
  useEffect(() => {
    loadUnassignedFaces();
  }, [unassignedPage, unassignedLimit]);

  // Load functions
  const loadPeople = async (overridePage?: number, isPageChange = false) => {
    try {
      if (isPageChange) {
        setPeopleGridLoading(true);
      } else {
        setPeopleLoading(true);
      }

      const params = new URLSearchParams();
      params.set('page', String(overridePage ?? page));
      params.set('limit', String(limit));
      if (peopleSearch.trim()) params.set('search', peopleSearch.trim());
      if (peopleSort !== 'default') params.set('sort', peopleSort);

      if (showPending) params.set('confirmed', 'false');
      if (showUnnamed) params.set('unnamed', 'true');
      if (showSingleFace) params.set('single_face', 'true');

      const response = await fetch(`/api/admin/people?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setPeople(data.people || []);
        setPagination(data.pagination || null);
        if (data.pagination?.page) setPage(data.pagination.page);
      } else {
        console.error('Failed to load people');
      }
    } catch (error) {
      console.error('Failed to load people:', error);
    } finally {
      setPeopleLoading(false);
      setPeopleGridLoading(false);
    }
  };

  const loadUnassignedFaces = async () => {
    try {
      setUnassignedLoading(true);
      const params = new URLSearchParams();
      params.set('unassigned', 'true');
      params.set('ignored', 'false');
      params.set('page', String(unassignedPage));
      params.set('limit', String(unassignedLimit));
      const response = await fetch(`/api/admin/people?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setUnassignedFaces(data.unassignedFaces || []);
        if (!originalUnassignedFaces) {
          setOriginalUnassignedFaces(data.unassignedFaces || []);
        }
        if (data.pagination) {
          setUnassignedPagination(data.pagination);
        } else {
          const total = (data.unassignedFaces || []).length;
          setUnassignedPagination({ page: unassignedPage, limit: unassignedLimit, total, totalPages: Math.max(1, Math.ceil(total / unassignedLimit)), hasMore: false });
        }
      } else {
        console.error('Failed to load unassigned faces');
      }
    } catch (error) {
      console.error('Failed to load unassigned faces:', error);
    } finally {
      setUnassignedLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/face-recognition/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        if (typeof data.faceRecognitionSimilarityThreshold === 'number') {
          setSimilarFilterThreshold(data.faceRecognitionSimilarityThreshold);
        }
        if (typeof data.faceRecognitionSimilarityThreshold === 'number') {
          setSimilarityThreshold(data.faceRecognitionSimilarityThreshold);
        }
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load face recognition settings',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load face recognition settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/admin/face-recognition');
      if (response.ok) {
        const data = await response.json();
        if (lastJobStatus && lastJobStatus !== data.status &&
            (data.status === 'ready' || data.status === 'completed')) {
          loadPeople();
          loadPhotoStats();
        }
        setStatus(data);
        setLastJobStatus(data.status);
      }
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  };

  const loadPhotoStats = async () => {
    try {
      const response = await fetch('/api/admin/photos/stats');
      if (response.ok) {
        const data = await response.json();
        setPhotoStats(data);
      }
    } catch (error) {
      console.error('Failed to load photo stats:', error);
    }
  };

  const loadAlbums = async () => {
    try {
      setAlbumsLoading(true);
      const response = await fetch('/api/admin/albums/tree');
      if (response.ok) {
        const data = await response.json();
        setAvailableAlbums(data.albums || []);
      } else {
        console.error('Failed to load albums');
      }
    } catch (error) {
      console.error('Failed to load albums:', error);
    } finally {
      setAlbumsLoading(false);
    }
  };

  // Handler functions
  const togglePersonSelection = (personId: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const toggleFaceSelection = (faceId: string) => {
    setSelectedFaces(prev => {
      const next = new Set(prev);
      if (next.has(faceId)) next.delete(faceId);
      else next.add(faceId);
      return next;
    });
  };

  const toggleAlbumSelection = (albumId: string) => {
    setSelectedAlbumIds(prev => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
  };

  const toggleAlbumExpansion = (albumId: string) => {
    setExpandedAlbums(prev => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
  };

  const selectAllAlbums = () => {
    const allIds = new Set<string>();
    const addAlbumIds = (albums: any[]) => {
      albums.forEach(album => {
        allIds.add(album.id);
        if (album.children) addAlbumIds(album.children);
      });
    };
    addAlbumIds(availableAlbums);
    setSelectedAlbumIds(allIds);
  };

  const deselectAllAlbums = () => {
    setSelectedAlbumIds(new Set());
  };

  const mergeSelectedPeople = async () => {
    if (selectedPeople.size < 2) {
      toast({ title: 'Error', description: 'Select at least two people to merge', variant: 'destructive' });
      return;
    }

    const ids = Array.from(selectedPeople);
    const targetId = ids[0];
    if (!confirm(`Are you sure you want to merge ${ids.length} people into the person with ID ${targetId}? This will reassign faces and delete the other person records.`)) {
      return;
    }

    try {
      const response = await fetch('/api/admin/people/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, sourceIds: ids.filter(id => id !== targetId) }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({ title: 'Success', description: data.message || 'People merged successfully' });
        setSelectedPeople(new Set());
        loadPeople();
        loadUnassignedFaces();
        setSelectedPerson(null);
      } else {
        const err = await response.json();
        toast({ title: 'Error', description: err.error || 'Merge failed', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Merge failed', variant: 'destructive' });
    }
  };

  const loadPersonDetails = async (personId: string) => {
    setPeopleLoading(true);
    try {
      const response = await fetch(`/api/admin/people/${personId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedPerson(data.person);
      } else {
        console.error('Failed to load person details');
        toast({
          title: 'Error',
          description: 'Failed to load person details.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to load person details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load person details.',
        variant: 'destructive',
      });
    } finally {
      setPeopleLoading(false);
    }
  };

  const deletePerson = async (personId: string, personName: string) => {
    if (!confirm(`Are you sure you want to delete "${personName}"? This will unassign all their faces.`)) {
      return;
    }

    setDeletingPerson(personId);
    try {
      const response = await fetch(`/api/admin/people/${personId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Person deleted successfully.',
        });
        loadPeople();
        loadUnassignedFaces();
        setSelectedPerson(null);
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete person.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete person.',
        variant: 'destructive',
      });
    } finally {
      setDeletingPerson(null);
    }
  };

  const ignoreSelectedFaces = async () => {
    if (selectedFaces.size === 0) {
      toast({ title: 'Nothing selected', description: 'Select one or more faces first.' });
      return;
    }

    try {
      const promises = Array.from(selectedFaces).map(faceId =>
        fetch(`/api/admin/faces/${faceId}/ignore`, {
          method: 'POST',
        })
      );

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.ok).length;

      if (successCount > 0) {
        toast({
          title: 'Success',
          description: `${successCount} face${successCount !== 1 ? 's' : ''} ignored successfully.`,
        });
        loadUnassignedFaces();
        setSelectedFaces(prev => {
          const newSet = new Set(prev);
          Array.from(selectedFaces).forEach(faceId => newSet.delete(faceId));
          return newSet;
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to ignore faces.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to ignore faces.',
        variant: 'destructive',
      });
    }
  };

  const showSimilarForSelected = async () => {
    if (selectedFaces.size === 0) {
      toast({ title: 'Nothing selected', description: 'Select one or more faces first.' });
      return;
    }

    try {
      const faceId = Array.from(selectedFaces)[0];
      const response = await fetch(`/api/admin/faces/${faceId}/similar?threshold=${similarFilterThreshold}&limit=100`);
      if (response.ok) {
        const data = await response.json();
        const similarFaceIds = new Set(data.similarFaces.map((f: any) => f.id));
        const filteredFaces = originalUnassignedFaces?.filter(face =>
          similarFaceIds.has(face.id) || selectedFaces.has(face.id)
        ) || [];
        setUnassignedFaces(filteredFaces);
        setShowingSimilar(true);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to find similar faces.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to find similar faces.',
        variant: 'destructive',
      });
    }
  };

  const clearSimilarFilter = () => {
    setUnassignedFaces(originalUnassignedFaces || []);
    setShowingSimilar(false);
  };

  const createPersonFromFaces = async () => {
    if (selectedFaces.size === 0 || !personQuery.trim()) {
      toast({ title: 'Error', description: 'Select faces and enter a name first.' });
      return;
    }

    setCreatingPerson(true);
    try {
      const response = await fetch('/api/admin/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: personQuery.trim(),
          faceIds: Array.from(selectedFaces),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: `Person "${data.person.name}" created with ${selectedFaces.size} face${selectedFaces.size !== 1 ? 's' : ''}.`,
        });
        setSelectedFaces(new Set());
        setPersonQuery('');
        setAssigneePersonId(null);
        setAssigneeResults([]);
        loadPeople();
        loadUnassignedFaces();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to create person.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create person.',
        variant: 'destructive',
      });
    } finally {
      setCreatingPerson(false);
    }
  };

  const assignSelectedFacesToPerson = async () => {
    if (selectedFaces.size === 0 || !assigneePersonId) {
      toast({ title: 'Error', description: 'Select faces and choose a person first.' });
      return;
    }

    setAssigningToPerson(true);
    try {
      const response = await fetch('/api/admin/faces/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faceIds: Array.from(selectedFaces),
          personId: assigneePersonId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const person = people.find(p => p.id === assigneePersonId);
        toast({
          title: 'Success',
          description: `${selectedFaces.size} face${selectedFaces.size !== 1 ? 's' : ''} assigned to "${person?.name || 'person'}".`,
        });
        setSelectedFaces(new Set());
        setPersonQuery('');
        setAssigneePersonId(null);
        setAssigneeResults([]);
        loadPeople();
        loadUnassignedFaces();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to assign faces.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to assign faces.',
        variant: 'destructive',
      });
    } finally {
      setAssigningToPerson(false);
    }
  };

  const saveSettings = async (newSettings: FaceRecognitionSettings) => {
    try {
      setSaving(true);
      const response = await fetch('/api/admin/face-recognition/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
      });

      if (response.ok) {
        setSettings(newSettings);
        toast({
          title: 'Success',
          description: 'Face recognition settings saved successfully',
        });
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to save settings',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const startProcessing = async (mode: 'new_only' | 'reprocess_keep_people' | 'reprocess_clear_all' = 'new_only') => {
    if (!settings.faceRecognitionEnabled) {
      toast({
        title: 'Error',
        description: 'Face recognition must be enabled first',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsProcessing(true);
      const response = await fetch('/api/admin/face-recognition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode,
          selectedAlbumIds: selectedAlbumIds.size > 0 ? Array.from(selectedAlbumIds) : null
        }),
      });

      if (response.ok) {
        const data = await response.json();

        let modeDescription: string;
        switch (mode) {
          case 'reprocess_keep_people':
            modeDescription = 'reprocessing all photos (keeping existing people)';
            break;
          case 'reprocess_clear_all':
            modeDescription = 'reprocessing all photos (removing all people and faces)';
            break;
          default:
            modeDescription = 'processing new photos only';
            break;
        }

        toast({
          title: 'Success',
          description: data.message || `Face recognition processing started (${modeDescription})`,
        });
        loadStatus();
        loadPhotoStats();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to start processing',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start processing',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePersonUpdated = () => {
    loadPeople();
    if (selectedPerson) {
      loadPersonDetails(selectedPerson.id);
    }
    loadUnassignedFaces();
  };

  const deleteAllPeople = async () => {
    try {
      setDeletingAllPeople(true);
      const response = await fetch('/api/admin/people/delete-all', {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: data.message,
        });
        loadPeople();
        loadUnassignedFaces();
        setSelectedPerson(null);
        setSelectedPeople(new Set());
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete all people',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete all people',
        variant: 'destructive',
      });
    } finally {
      setDeletingAllPeople(false);
    }
  };

  const deleteAllUnassignedFaces = async () => {
    try {
      setDeletingUnassignedFaces(true);
      const response = await fetch('/api/admin/faces/delete-unassigned', {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: data.message,
        });
        loadUnassignedFaces();
        setSelectedFaces(new Set());
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete unassigned faces',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete unassigned faces',
        variant: 'destructive',
      });
    } finally {
      setDeletingUnassignedFaces(false);
    }
  };

  const processUnassignedFaces = async () => {
    try {
      setProcessingUnassigned(true);
      const response = await fetch('/api/admin/faces/process-unassigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          similarityThreshold,
          mode: processMode,
          limit: Math.max(50, Math.min(Number(groupingLimit) || 500, 2000)),
          randomize: !!groupingRandomize,
          maxComparisons: Math.max(1000, Math.min(Number(groupingMaxComparisons) || 50000, 500000)),
          preCluster: !!groupingPreCluster,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: data.message,
        });
        loadPeople();
        loadUnassignedFaces();
        setSelectedFaces(new Set());
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to process unassigned faces',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process unassigned faces',
        variant: 'destructive',
      });
    } finally {
      setProcessingUnassigned(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Eye className="h-8 w-8" />
          Face Recognition System
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage face detection, recognition, and people identification settings
        </p>
      </div>

      <Tabs defaultValue="settings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="processing" className="flex items-center gap-2">
            <Play className="h-4 w-4" />
            Processing
          </TabsTrigger>
          <TabsTrigger value="people" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            People
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6">
          <FaceRecognitionSettings
            settings={settings}
            onUpdate={saveSettings}
            loading={loading || saving}
          />
        </TabsContent>

        <TabsContent value="processing" className="space-y-6">
          <ProcessingStatus
            settings={settings}
            status={status}
            lastJobStatus={lastJobStatus}
          />

          <ProcessingControls
            isProcessing={isProcessing}
            availableAlbums={availableAlbums}
            selectedAlbumIds={selectedAlbumIds}
            expandedAlbums={expandedAlbums}
            albumsLoading={albumsLoading}
            onStartProcessing={(mode: 'new_only' | 'reprocess_keep_people' | 'reprocess_remove_all') => startProcessing(mode as any)}
            onToggleAlbumSelection={toggleAlbumSelection}
            onToggleAlbumExpansion={toggleAlbumExpansion}
          />
        </TabsContent>

        <TabsContent value="people" className="space-y-6">
          {selectedPerson ? (
            <PersonDetail
              person={selectedPerson}
              onBack={() => setSelectedPerson(null)}
              onPersonUpdated={handlePersonUpdated}
            />
          ) : (
            <PeopleManagement
              people={people}
              selectedPeople={selectedPeople}
              peopleLoading={peopleLoading}
              peopleGridLoading={peopleGridLoading}
              pagination={pagination}
              page={page}
              limit={limit}
              peopleSearch={peopleSearch}
              peopleSort={peopleSort}
              peopleFilter={'all'}
              showPending={showPending}
              showUnnamed={showUnnamed}
              showSingleFace={showSingleFace}
              deletingAllPeople={deletingAllPeople}
              onLoadPersonDetails={loadPersonDetails}
              onTogglePersonSelection={togglePersonSelection}
              onMergeSelectedPeople={mergeSelectedPeople}
              onDeletePerson={deletePerson}
              onDeleteAllPeople={deleteAllPeople}
              onPageChange={setPage}
              onLimitChange={setLimit}
              onPeopleSearchChange={setPeopleSearch}
              onPeopleSortChange={setPeopleSort}
              onPeopleFilterChange={() => {}}
              onToggleShowPending={() => setShowPending(!showPending)}
              onToggleShowUnnamed={() => setShowUnnamed(!showUnnamed)}
              onToggleShowSingleFace={() => setShowSingleFace(!showSingleFace)}
              onClearFilters={() => {
                setPeopleSearch('');
                setPeopleSort('default');
                setShowPending(false);
                setShowUnnamed(false);
                setShowSingleFace(false);
              }}
              onLoadPeople={() => loadPeople()}
            />
          )}

          <UnassignedFaces
            unassignedFaces={unassignedFaces}
            unassignedLoading={unassignedLoading}
            unassignedPage={unassignedPage}
            unassignedLimit={unassignedLimit}
            unassignedPagination={unassignedPagination}
            selectedFaces={selectedFaces}
            processingUnassigned={processingUnassigned}
            deletingUnassignedFaces={deletingUnassignedFaces}
            similarityThreshold={similarityThreshold}
            processMode={processMode}
            groupingLimit={groupingLimit}
            showingSimilar={showingSimilar}
            similarFilterThreshold={similarFilterThreshold}
            onProcessUnassignedFaces={processUnassignedFaces}
            onDeleteAllUnassignedFaces={deleteAllUnassignedFaces}
            onIgnoreSelectedFaces={ignoreSelectedFaces}
            onShowSimilarForSelected={showSimilarForSelected}
            onClearSimilarFilter={clearSimilarFilter}
            onToggleFaceSelection={toggleFaceSelection}
            onSimilarityThresholdChange={setSimilarityThreshold}
            onProcessModeChange={setProcessMode}
            onGroupingLimitChange={setGroupingLimit}
            onSimilarFilterThresholdChange={setSimilarFilterThreshold}
            onPageChange={setUnassignedPage}
          />
        </TabsContent>
      </Tabs>

      {/* Floating Create / Assign Panel */}
      {selectedFaces.size > 0 && (
        <div className="fixed right-6 bottom-6 z-50 w-80 bg-white dark:bg-slate-800 border rounded-lg shadow-lg p-4">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            {selectedFaces.size > 0 ? `Create Person from ${selectedFaces.size}` : 'Create / Assign'}
          </h4>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground">Person</label>
              <Input
                placeholder="Type to find or create a person..."
                value={personQuery || (assigneePersonId ? (people.find(p => p.id === assigneePersonId)?.name || '') : '')}
                onChange={(e) => {
                  const q = e.target.value;
                  setPersonQuery(q);
                  setAssigneePersonId(null);
                  if (assigneeDebounce.current) window.clearTimeout(assigneeDebounce.current);
                  if (!q.trim()) {
                    setAssigneeResults([]);
                    setAssigneeSearching(false);
                    return;
                  }
                  setAssigneeSearching(true);
                  assigneeDebounce.current = window.setTimeout(async () => {
                    try {
                      const res = await fetch(`/api/admin/people?search=${encodeURIComponent(q)}&limit=50`);
                      if (res.ok) {
                        const data = await res.json();
                        setAssigneeResults(data.people || []);
                      } else {
                        setAssigneeResults([]);
                      }
                    } catch (err) {
                      setAssigneeResults([]);
                    } finally {
                      setAssigneeSearching(false);
                    }
                  }, 300);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (assigneePersonId) assignSelectedFacesToPerson();
                    else createPersonFromFaces();
                  }
                }}
                ref={personNameInputRef}
              />
              {/* Autocomplete dropdown for existing people */}
              {(assigneeSearching || (assigneeResults && assigneeResults.length > 0)) && (
                <div className="mt-2 max-h-48 overflow-auto rounded-md border bg-white dark:bg-slate-800">
                  {assigneeSearching ? (
                    <div className="p-2 text-sm text-muted-foreground">Searching...</div>
                  ) : (
                    assigneeResults.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between gap-2 p-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 ${assigneePersonId === p.id ? 'bg-gray-100 dark:bg-slate-700' : ''}`}
                        onClick={() => {
                          setAssigneePersonId(p.id);
                          setPersonQuery(p.name);
                          setAssigneeResults([]);
                        }}
                      >
                        <div className="truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.faceCount} face{p.faceCount !== 1 ? 's' : ''}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  if (assigneePersonId) assignSelectedFacesToPerson();
                  else createPersonFromFaces();
                }}
                disabled={creatingPerson || assigningToPerson || selectedFaces.size === 0 || (!personQuery.trim() && !assigneePersonId)}
                className="flex-1"
              >
                {assigneePersonId ? (assigningToPerson ? 'Assigning...' : `Assign to ${people.find(p => p.id === assigneePersonId)?.name ?? 'person'}`) : (creatingPerson ? 'Creating...' : `Create Person`)}
              </Button>
              <Button variant="ghost" onClick={() => { setAssigneePersonId(null); setPersonQuery(''); setAssigneeResults([]); setSelectedFaces(new Set()) }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
