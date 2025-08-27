'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
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
import { useToast } from '@/hooks/use-toast';
import { FaceRecognitionSettings } from '@/components/Admin/FaceRecognitionSettings';
import { PersonDetail } from '@/components/Admin/PersonDetail'; // Import the new component
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
  X, // Import X icon
  ChevronDown,
  SortAsc,
  SortDesc,
  Calendar,
  Hash,
  Cpu,
  Copy,
  RefreshCw,
  User,
  Merge
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
  faces: Face[]; // Add faces array to Person interface
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
  ignored?: boolean; // Add ignored field
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
  const [lastJobStatus, setLastJobStatus] = useState<string | null>(null);
  const [unassignedFaces, setUnassignedFaces] = useState<UnassignedFace[]>([]);
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [unassignedLimit, setUnassignedLimit] = useState(48);
  const [unassignedPagination, setUnassignedPagination] = useState<any | null>(null);
  const [selectedFaces, setSelectedFaces] = useState<Set<string>>(new Set());
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null); // New state for selected person
  
  // New state variables for bulk operations
  const [deletingAllPeople, setDeletingAllPeople] = useState(false);
  const [deletingUnassignedFaces, setDeletingUnassignedFaces] = useState(false);
  const [processingUnassigned, setProcessingUnassigned] = useState(false);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  const [processMode, setProcessMode] = useState<'create_new' | 'assign_existing' | 'both'>('both');
  
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
  
  // Duplicate detection state variables
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [mergingDuplicates, setMergingDuplicates] = useState<string | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
    loadStatus();
    loadPeople();
    loadUnassignedFaces();
    loadPhotoStats();
    loadDuplicates();
  }, []);

  // Reload people when page or limit change
  useEffect(() => {
    loadPeople();
  }, [page, limit]);

  // Debounced reload when peopleSearch or peopleSort change
  useEffect(() => {
    if (peopleSearchDebounce.current) window.clearTimeout(peopleSearchDebounce.current);
    peopleSearchDebounce.current = window.setTimeout(() => {
      loadPeople(1);
    }, 300);

    return () => {
      if (peopleSearchDebounce.current) window.clearTimeout(peopleSearchDebounce.current);
    };
  }, [peopleSearch, peopleSort]);

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

  const loadPeople = async (overridePage?: number) => {
    try {
      setPeopleLoading(true);
  const params = new URLSearchParams();
  params.set('page', String(overridePage ?? page));
  params.set('limit', String(limit));
  if (peopleSearch.trim()) params.set('search', peopleSearch.trim());
  if (peopleSort !== 'default') params.set('sort', peopleSort);
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
    }
  };

  const togglePersonSelection = (personId: string) => {
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const mergeSelectedPeople = async () => {
    if (selectedPeople.size < 2) {
      toast({ title: 'Error', description: 'Select at least two people to merge', variant: 'destructive' });
      return;
    }

    const ids = Array.from(selectedPeople);
    // Ask admin to choose a target (simple: pick the first as target) or confirm
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

  const loadUnassignedFaces = async () => {
    try {
      setUnassignedLoading(true);
      // Fetch paginated unassigned faces from the main people route (returns pagination)
      const params = new URLSearchParams();
      params.set('unassigned', 'true');
      params.set('ignored', 'false');
      params.set('page', String(unassignedPage));
      params.set('limit', String(unassignedLimit));
      const response = await fetch(`/api/admin/people?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        // people route returns { unassignedFaces, pagination }
        setUnassignedFaces(data.unassignedFaces || []);
        // Ensure we always have a pagination object (fallback if server omitted it)
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

  // Reload unassigned faces when page or limit change
  useEffect(() => {
    loadUnassignedFaces();
  }, [unassignedPage, unassignedLimit]);

  const toggleFaceSelection = (faceId: string) => {
    setSelectedFaces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(faceId)) {
        newSet.delete(faceId);
      } else {
        newSet.add(faceId);
      }
      return newSet;
    });
  };

  const createPersonFromFaces = async () => {
    if (selectedFaces.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one face',
        variant: 'destructive',
      });
      return;
    }

    // Check if any selected face is ignored
    const hasIgnoredFace = Array.from(selectedFaces).some(faceId => 
      unassignedFaces.find(f => f.id === faceId)?.ignored
    );

    if (hasIgnoredFace) {
      toast({
        title: 'Error',
        description: 'Cannot create person with ignored faces. Please unselect them.',
        variant: 'destructive',
      });
      return;
    }

    if (!personQuery.trim()) {
      toast({ title: 'Error', description: 'Please enter a name for the person', variant: 'destructive' });
      return;
    }

    try {
      setCreatingPerson(true);
    const response = await fetch('/api/admin/people/create-from-faces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
      name: personQuery.trim(),
          faceIds: Array.from(selectedFaces),
        }),
      });

      if (response.ok) {
        const data = await response.json();
  toast({ title: 'Success', description: data.message || `Created person "${personQuery}" with ${selectedFaces.size} faces` });
        
        // Reset form
  setPersonQuery('');
        setSelectedFaces(new Set());
        
        // Reload data
        loadPeople();
        loadUnassignedFaces();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
    description: error.error || 'Failed to create person',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create person',
        variant: 'destructive',
      });
    } finally {
      setCreatingPerson(false);
    }
  };

  const assignSelectedFacesToPerson = async () => {
    if (selectedFaces.size === 0) {
      toast({ title: 'Error', description: 'Please select at least one face', variant: 'destructive' });
      return;
    }

    if (!assigneePersonId) {
      toast({ title: 'Error', description: 'Please select a person to assign to', variant: 'destructive' });
      return;
    }

    // Check if any selected face is ignored
    const hasIgnoredFace = Array.from(selectedFaces).some(faceId => 
      unassignedFaces.find(f => f.id === faceId)?.ignored
    );

    if (hasIgnoredFace) {
      toast({ title: 'Error', description: 'Cannot assign ignored faces. Please unselect them.', variant: 'destructive' });
      return;
    }

    try {
      setAssigningToPerson(true);
      const response = await fetch(`/api/admin/people/${assigneePersonId}/add-faces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceIds: Array.from(selectedFaces) }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({ title: 'Success', description: data.message || `Assigned ${data.count || selectedFaces.size} faces to person.` });
        setSelectedFaces(new Set());
        setAssigneePersonId(null);
        loadPeople();
        loadUnassignedFaces();
      } else {
        const error = await response.json();
        toast({ title: 'Error', description: error.error || 'Failed to assign faces', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to assign faces', variant: 'destructive' });
    } finally {
      setAssigningToPerson(false);
    }
  };

  const deletePerson = async (personId: string, personName: string) => {
    if (!confirm(`Are you sure you want to delete "${personName}"? This will unassign all their faces.`)) {
      return;
    }

    try {
      setDeletingPerson(personId);
      const response = await fetch(`/api/admin/people/${personId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: data.message || `Deleted person "${personName}"`,
        });
        
        // Reload data
        loadPeople();
        loadUnassignedFaces();
        setSelectedPerson(null); // Close detail view if open
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to delete person',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete person',
        variant: 'destructive',
      });
    } finally {
      setDeletingPerson(null);
    }
  };

  const ignoreFace = async (faceId: string) => {
    if (!confirm('Are you sure you want to ignore this face? It will no longer appear in the unassigned list.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/faces/${faceId}/ignore`, {
        method: 'POST',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Face ignored successfully.',
        });
        loadUnassignedFaces(); // Refresh unassigned faces
        setSelectedFaces(prev => {
          const newSet = new Set(prev);
          newSet.delete(faceId); // Deselect the ignored face
          return newSet;
        });
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to ignore face.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to ignore face.',
        variant: 'destructive',
      });
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/face-recognition/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
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
        
        // Check if job status changed from running to completed
        if (lastJobStatus && lastJobStatus !== data.status && 
            (data.status === 'ready' || data.status === 'completed')) {
          // Job completed, reload people data and photo stats
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
        body: JSON.stringify({ mode }),
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
    loadPeople(); // Refresh the main people list
    if (selectedPerson) {
      loadPersonDetails(selectedPerson.id); // Refresh the currently viewed person's details
    }
    loadUnassignedFaces(); // Also refresh unassigned faces as they might change
  };

  // New handler functions for bulk operations
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
        
        // Reload data
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
        
        // Reload unassigned faces
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
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: data.message,
        });
        
        // Reload data
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

  // Duplicate detection functions
  const loadDuplicates = async () => {
    try {
      setDuplicatesLoading(true);
      const response = await fetch('/api/admin/people/duplicates');
      
      if (response.ok) {
        const data = await response.json();
        setDuplicates(data.duplicates || []);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load duplicate people',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load duplicate people',
        variant: 'destructive',
      });
    } finally {
      setDuplicatesLoading(false);
    }
  };

  const mergeDuplicates = async (duplicateGroupId: string, keepPersonId: string, mergePersonIds: string[]) => {
    try {
      setMergingDuplicates(duplicateGroupId);
      const response = await fetch('/api/admin/people/duplicates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keepPersonId,
          mergePersonIds,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: data.message,
        });
        
        // Reload people and duplicates
        loadPeople();
        loadDuplicates();
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to merge people',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to merge people',
        variant: 'destructive',
      });
    } finally {
      setMergingDuplicates(null);
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

                  {status && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <Badge variant="outline" className="mb-2">
                              {status.status || 'Ready'}
                            </Badge>
                            <p className="text-sm text-muted-foreground">Status</p>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <p className="text-2xl font-bold">{photoStats?.processed || 0}</p>
                            <p className="text-sm text-muted-foreground">Photos Processed</p>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-orange-600">{photoStats?.unprocessed || 0}</p>
                            <p className="text-sm text-muted-foreground">Photos Pending</p>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <p className="text-2xl font-bold">{photoStats?.total || 0}</p>
                            <p className="text-sm text-muted-foreground">Total Photos</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  
                  {/* Processing Progress Bar */}
                  {photoStats && photoStats.total > 0 && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Processing Progress</span>
                        <span className="text-sm text-muted-foreground">
                          {photoStats.processed} / {photoStats.total} photos ({photoStats.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${photoStats.percentage}%` }}
                        ></div>
                      </div>
                      {photoStats.unprocessed > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {photoStats.unprocessed} photos are ready for face processing
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-4">
                    {/* Processing Mode Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          className="flex items-center gap-2"
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          {isProcessing ? 'Processing...' : 'Start Face Processing'}
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-80">
                        <DropdownMenuLabel>Processing Options</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => startProcessing('new_only')} disabled={isProcessing}>
                          <Play className="h-4 w-4 mr-2" />
                          <div>
                            <div className="font-medium">Process New Photos Only</div>
                            <div className="text-xs text-muted-foreground">Process photos that haven't been analyzed yet</div>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={isProcessing}>
                              <Cpu className="h-4 w-4 mr-2" />
                              <div>
                                <div className="font-medium">Reprocess All Photos (Keep People)</div>
                                <div className="text-xs text-muted-foreground">Re-detect faces but keep existing people for re-matching</div>
                              </div>
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reprocess All Photos (Keep People)?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action will:
                                <br />• Delete all detected faces
                                <br />• Keep existing people (they may be re-matched to new faces)
                                <br />• Reprocess all photos to detect faces again
                                <br /><br />
                                Existing people will remain but may end up with different faces assigned to them.
                                Are you sure you want to continue?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => startProcessing('reprocess_keep_people')}
                                className="bg-orange-600 hover:bg-orange-700"
                              >
                                Reprocess (Keep People)
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={isProcessing}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              <div>
                                <div className="font-medium">Reprocess All Photos (Remove All)</div>
                                <div className="text-xs text-muted-foreground">Clear all faces and people, then reprocess everything</div>
                              </div>
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reprocess All Photos (Remove All)?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action will permanently delete ALL existing data:
                                <br />• All detected faces
                                <br />• All people and their groupings
                                <br />• All face recognition assignments
                                <br /><br />
                                Then it will reprocess all photos from scratch to detect and group faces again.
                                This operation cannot be undone. Are you sure you want to continue?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => startProcessing('reprocess_clear_all')}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Reprocess (Remove All)
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    <Button 
                      variant="outline"
                      disabled
                      className="flex items-center gap-2"
                    >
                      <Pause className="h-4 w-4" />
                      Pause
                    </Button>
                    
                    <Button 
                      variant="outline"
                      disabled
                      className="flex items-center gap-2"
                    >
                      <Square className="h-4 w-4" />
                      Stop
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="people" className="space-y-6">
          {selectedPerson ? (
            <PersonDetail 
              person={selectedPerson} 
              onBack={() => setSelectedPerson(null)} 
              onPersonUpdated={handlePersonUpdated} 
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  People Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!settings.faceRecognitionEnabled ? (
                  <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">Face Recognition Required</p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-300">Enable face recognition to manage people and faces</p>
                    </div>
                  </div>
                ) : peopleLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading people...</p>
                  </div>
                ) : people.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No People Detected Yet</h3>
                    <p className="text-muted-foreground mb-4">Start processing photos to detect and group faces into people</p>
                    <Button onClick={() => startProcessing('new_only')} className="flex items-center gap-2">
                      <Play className="h-4 w-4" /> Start Face Detection
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-muted-foreground">Found {pagination?.total ?? people.length} people · Page {pagination?.page ?? page} of {pagination?.totalPages ?? 1}</p>
                        <Input placeholder="Filter people by name..." value={peopleSearch} onChange={(e) => { setPeopleSearch(e.target.value); }} className="max-w-xs" />
                        
                        {/* Updated Sort Dropdown */}
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
                            <DropdownMenuItem onClick={() => setPeopleSort('default')} className={peopleSort === 'default' ? 'bg-accent' : ''}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Default (Confirmed first)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPeopleSort('alpha')} className={peopleSort === 'alpha' ? 'bg-accent' : ''}>
                              <SortAsc className="h-4 w-4 mr-2" />
                              Name (A-Z)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPeopleSort('face_count_desc')} className={peopleSort === 'face_count_desc' ? 'bg-accent' : ''}>
                              <SortDesc className="h-4 w-4 mr-2" />
                              Most Faces First
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPeopleSort('face_count_asc')} className={peopleSort === 'face_count_asc' ? 'bg-accent' : ''}>
                              <SortAsc className="h-4 w-4 mr-2" />
                              Fewest Faces First
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPeopleSort('created_desc')} className={peopleSort === 'created_desc' ? 'bg-accent' : ''}>
                              <Calendar className="h-4 w-4 mr-2" />
                              Newest First
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPeopleSort('created_asc')} className={peopleSort === 'created_asc' ? 'bg-accent' : ''}>
                              <Calendar className="h-4 w-4 mr-2" />
                              Oldest First
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        
                        <Button onClick={mergeSelectedPeople} variant="destructive" size="sm" disabled={selectedPeople.size < 2} className="ml-2">Merge Selected ({selectedPeople.size})</Button>
                        
                        {/* New Bulk Operations */}
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
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete all people records and unassign all their faces. 
                                The faces will become unassigned and can be reassigned later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={deleteAllPeople} className="bg-destructive hover:bg-destructive/90">
                                Delete All People
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Button onClick={() => { if ((pagination?.page || page) > 1) { setPage((pagination?.page || page) - 1); } }} variant="outline" size="sm" disabled={peopleLoading || ((pagination?.page || page) <= 1)}>Prev</Button>
                          <Button onClick={() => { const current = pagination?.page || page; if (pagination?.hasMore ?? true) { setPage(current + 1); } }} variant="outline" size="sm" disabled={peopleLoading || !(pagination?.hasMore ?? true)}>Next</Button>
                        </div>
                        <Button onClick={() => loadPeople()} variant="outline" size="sm" className="flex items-center gap-2"><Eye className="h-4 w-4" /> Refresh</Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {people.map((person) => (
                        <Card key={person.id} className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={() => loadPersonDetails(person.id)}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium truncate">{person.name}</h4>
                              <input type="checkbox" checked={selectedPeople.has(person.id)} onChange={(e) => { e.stopPropagation(); togglePersonSelection(person.id); }} onClick={(e) => e.stopPropagation()} />
                            </div>

                            <div className="flex items-start gap-3">
                              {person.previewFace && (
                                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                  <img src={`/api/faces/${person.previewFace.id}/serve`} alt={`${person.name} preview`} className="w-full h-full object-cover" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {person.confirmed ? (
                                    <Badge variant="default" className="text-xs"><CheckCircle className="h-3 w-3 mr-1" />OK</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{person.faceCount} face{person.faceCount !== 1 ? 's' : ''}</p>
                                {person.previewFace && (<p className="text-xs text-muted-foreground mt-1">Confidence: {Math.round(person.previewFace.confidence * 100)}%</p>)}
                              </div>
                              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); deletePerson(person.id.toString(), person.name); }} disabled={deletingPerson === person.id.toString()} className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0">
                                {deletingPerson === person.id.toString() ? (<div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />) : (<Trash2 className="h-4 w-4" />)}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Unassigned Faces Section */}
                    <div className="mt-8">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium flex items-center gap-2"><Grid3X3 className="h-5 w-5" /> Unassigned Faces</h3>
                        <div className="flex items-center gap-2">
                          {/* Process Unassigned Faces with Settings */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" disabled={processingUnassigned || unassignedFaces.length === 0}>
                                {processingUnassigned ? (
                                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                ) : (
                                  <Cpu className="h-4 w-4 mr-2" />
                                )}
                                Auto-Process Faces
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-lg">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Process Unassigned Faces</AlertDialogTitle>
                                <AlertDialogDescription asChild>
                                  <div className="space-y-4">
                                    <p>Automatically process unassigned faces based on similarity threshold. This will group similar faces together.</p>
                                    
                                    <div className="space-y-3">
                                      <div>
                                        <Label htmlFor="similarity-threshold">Similarity Threshold: {Math.round(similarityThreshold * 100)}%</Label>
                                        <Slider
                                          id="similarity-threshold"
                                          min={0.3}
                                          max={0.95}
                                          step={0.05}
                                          value={[similarityThreshold]}
                                          onValueChange={(value) => setSimilarityThreshold(value[0])}
                                          className="mt-2"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">Higher values require more similarity</p>
                                      </div>
                                      
                                      <div>
                                        <Label>Processing Mode</Label>
                                        <div className="mt-2 space-y-2">
                                          <label className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              name="processMode"
                                              value="create_new"
                                              checked={processMode === 'create_new'}
                                              onChange={(e) => setProcessMode(e.target.value as any)}
                                            />
                                            <span className="text-sm">Create new people only</span>
                                          </label>
                                          <label className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              name="processMode"
                                              value="assign_existing"
                                              checked={processMode === 'assign_existing'}
                                              onChange={(e) => setProcessMode(e.target.value as any)}
                                            />
                                            <span className="text-sm">Assign to existing people only</span>
                                          </label>
                                          <label className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              name="processMode"
                                              value="both"
                                              checked={processMode === 'both'}
                                              onChange={(e) => setProcessMode(e.target.value as any)}
                                            />
                                            <span className="text-sm">Both (recommended)</span>
                                          </label>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={processUnassignedFaces}>
                                  Start Processing
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          
                          {/* Delete All Unassigned Faces */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm" disabled={deletingUnassignedFaces || unassignedFaces.length === 0}>
                                {deletingUnassignedFaces ? (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                ) : (
                                  <Trash2 className="h-4 w-4 mr-2" />
                                )}
                                Delete All Unassigned
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete All Unassigned Faces?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete all {unassignedFaces.length} unassigned faces. 
                                  You may want to process them first to create people.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={deleteAllUnassignedFaces} className="bg-destructive hover:bg-destructive/90">
                                  Delete All Unassigned Faces
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <Card>
                        <CardContent className="p-4">
                          {unassignedLoading ? (
                            <div className="text-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div><p className="text-muted-foreground">Loading unassigned faces...</p></div>
                          ) : unassignedFaces.length === 0 ? (
                            <div className="text-center py-8"><CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" /><h4 className="font-medium mb-2">All Faces Assigned</h4><p className="text-muted-foreground">All detected faces have been assigned to people</p></div>
                          ) : (
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm text-muted-foreground mb-3">Click faces to select them for grouping into a person. Selected: {selectedFaces.size}</p>
                                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                  {unassignedFaces.map((face) => (
                                    <div key={face.id} className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedFaces.has(face.id) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`} onClick={() => toggleFaceSelection(face.id)}>
                                      <div className="aspect-square bg-gray-100"><img src={`/api/faces/${face.id}/serve`} alt={`face-${face.id}`} className="w-full h-full object-cover" /></div>
                                      {face.ignored && (<div className="absolute top-1 left-1 bg-yellow-100 text-yellow-800 text-xs px-1 rounded">Ignored</div>)}
                                      <div className="absolute bottom-1 right-1 flex gap-1"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); ignoreFace(face.id); }}>Ignore</Button></div>
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-4 flex items-center justify-between">
                                  <p className="text-sm text-muted-foreground">Page {unassignedPagination?.page ?? unassignedPage} of {unassignedPagination?.totalPages ?? 1} · {unassignedPagination?.total ?? unassignedFaces.length} faces</p>
                                  <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" disabled={unassignedLoading || ((unassignedPagination?.page ?? unassignedPage) <= 1)} onClick={() => { const current = unassignedPagination?.page ?? unassignedPage; if (current > 1) setUnassignedPage(current - 1); }}>Prev</Button>
                                    <Button variant="outline" size="sm" disabled={unassignedLoading || !(unassignedPagination?.hasMore ?? false)} onClick={() => { const current = unassignedPagination?.page ?? unassignedPage; setUnassignedPage(current + 1); }}>Next</Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Duplicate People Resolution - only show when not viewing a specific person */}
          {!selectedPerson && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Copy className="h-5 w-5" />
                  Duplicate People Resolution
                  <Button
                    onClick={loadDuplicates}
                    variant="outline"
                    size="sm"
                    disabled={duplicatesLoading}
                    className="ml-auto"
                  >
                    {duplicatesLoading ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Scan for Duplicates
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {duplicatesLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Scanning for duplicate people...</p>
                  </div>
                ) : duplicates.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h4 className="font-medium mb-2">No Duplicates Found</h4>
                    <p className="text-muted-foreground">All people appear to be unique based on name and face similarity</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground mb-4">
                      Found {duplicates.length} potential duplicate groups. Review and merge similar people to improve organization.
                    </div>
                    
                    {duplicates.map((group) => (
                      <div key={group.id} className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              group.confidence === 'high' ? 'default' : 
                              group.confidence === 'medium' ? 'secondary' : 'outline'
                            }>
                              {group.confidence} confidence
                            </Badge>
                            <Badge variant="outline">
                              {group.similarityType === 'both' ? 'Name + Face' : 
                               group.similarityType === 'face' ? 'Face similarity' : 'Name similarity'}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Score: {(group.similarityScore * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {group.people.map((person: any, index: number) => (
                            <div key={person.id} className="flex items-center gap-3 p-3 border rounded-lg">
                              {person.previewFace ? (
                                <img
                                  src={`/api/photos/${person.previewFace.id}/thumbnail`}
                                  alt={person.name}
                                  className="w-12 h-12 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                  <User className="h-6 w-6 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1">
                                <p className="font-medium">{person.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {person.faceCount} faces • Created {new Date(person.createdAt).toLocaleDateString()}
                                </p>
                                {person.confirmed && (
                                  <Badge variant="outline" className="text-xs">Confirmed</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="default" 
                                size="sm"
                                disabled={mergingDuplicates === group.id}
                              >
                                {mergingDuplicates === group.id ? (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                ) : (
                                  <Merge className="h-4 w-4 mr-2" />
                                )}
                                Merge People
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuLabel>Keep which person?</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {group.people.map((person: any) => (
                                <DropdownMenuItem
                                  key={person.id}
                                  onClick={() => {
                                    const otherIds = group.people
                                      .filter((p: any) => p.id !== person.id)
                                      .map((p: any) => p.id);
                                    mergeDuplicates(group.id, person.id, otherIds);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    <span>{person.name}</span>
                                    <span className="text-muted-foreground">({person.faceCount} faces)</span>
                                  </div>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          <Button variant="outline" size="sm">
                            <X className="h-4 w-4 mr-2" />
                            Not Duplicates
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    {/* Floating Create / Assign Panel (shown only when faces selected) */}
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
              // selecting a person should clear selected person id when typing
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
                // If an existing person is highlighted/selected, assign; otherwise create
                if (assigneePersonId) assignSelectedFacesToPerson();
                else createPersonFromFaces();
              }
            }}
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
          <Button variant="ghost" onClick={() => { setAssigneePersonId(null); setPersonQuery(''); setAssigneeResults([]); }}>
            Cancel
          </Button>
        </div>
      </div>
      </div>
    )}
  </div>
  );
}
