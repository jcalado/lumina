'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Trash2,
  Plus,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  Edit,
  Save,
  X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link'; // Import Link
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
  albumId: string; // Add albumId to Photo interface
  albumSlug: string; // Add albumSlug to Photo interface
}

interface Face {
  id: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  photo: Photo;
  personId?: string; // Optional, as unassigned faces won't have it
}

interface Person {
  id: string;
  name: string;
  confirmed: boolean;
  faceCount: number;
  previewFace?: Face;
  createdAt: string;
  updatedAt: string;
  faces: Face[]; // All faces associated with this person
}

interface PersonDetailProps {
  person: Person;
  onBack: () => void;
  onPersonUpdated: () => void; // Callback to refresh people list
}

export function PersonDetail({ person, onBack, onPersonUpdated }: PersonDetailProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [similarFaces, setSimilarFaces] = useState<Face[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [selectedSimilarFaces, setSelectedSimilarFaces] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [localThreshold, setLocalThreshold] = useState<number | null>(null);
  const [usedThreshold, setUsedThreshold] = useState<number | null>(null);
  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(person.name);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(person.confirmed);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [selectedPersonFaces, setSelectedPersonFaces] = useState<Set<string>>(new Set());
  const [disablingFaces, setDisablingFaces] = useState(false);
  // Duplicate detection state
  const [duplicateCandidates, setDuplicateCandidates] = useState<Array<{
    id: string;
    name: string | null;
    confirmed: boolean;
    faceCount: number;
    bestSimilarity: number;
    previewFaceId: string | null;
  }>>([]);
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set());
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [duplicateThreshold, setDuplicateThreshold] = useState<number | null>(null);
  const [usedDuplicateThreshold, setUsedDuplicateThreshold] = useState<number | null>(null);

  useEffect(() => {
    // When person changes, clear similar faces and selections
    setSimilarFaces([]);
    setSelectedSimilarFaces(new Set());
    setSearchQuery('');
    // sync name input and cancel any edit state
    setNameInput(person.name);
    setIsEditingName(false);
    setIsConfirmed(person.confirmed);
    // reset duplicate selections when switching person
    setDuplicateCandidates([]);
    setSelectedDuplicates(new Set());
    setUsedDuplicateThreshold(null);
  }, [person.id]);

  useEffect(() => {
    if (isEditingName) {
      const t = setTimeout(() => {
        if (nameInputRef.current) {
          nameInputRef.current.focus();
          nameInputRef.current.select();
        }
      }, 0);
      return () => clearTimeout(t);
    }
  }, [isEditingName]);

  const fetchSimilarFaces = async () => {
    setLoadingSimilar(true);
    try {
  const params = new URLSearchParams();
  if (localThreshold !== null) params.set('threshold', String(localThreshold));
  const response = await fetch(`/api/admin/people/${person.id}/similar-faces?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setSimilarFaces(data.similarFaces || []);
        setUsedThreshold(typeof data.usedThreshold === 'number' ? data.usedThreshold : null);
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to load similar faces',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load similar faces',
        variant: 'destructive',
      });
    } finally {
      setLoadingSimilar(false);
    }
  };

  const toggleConfirmed = async () => {
    const newConfirmed = !isConfirmed;
    setConfirmLoading(true);
    try {
      const response = await fetch(`/api/admin/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: newConfirmed }),
      });

      if (response.ok) {
        setIsConfirmed(newConfirmed);
        toast({ title: 'Success', description: `Person marked as ${newConfirmed ? 'confirmed' : 'pending'}.` });
        onPersonUpdated();
      } else {
        const err = await response.json();
        toast({ title: 'Error', description: err.error || 'Failed to update status', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    } finally {
      setConfirmLoading(false);
    }
  };

  const toggleSimilarFaceSelection = (faceId: string) => {
    setSelectedSimilarFaces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(faceId)) {
        newSet.delete(faceId);
      } else {
        newSet.add(faceId);
      }
      return newSet;
    });
  };

  const addSelectedFacesToPerson = async () => {
    if (selectedSimilarFaces.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one face to add.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/people/${person.id}/add-faces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          faceIds: Array.from(selectedSimilarFaces),
        }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: `Added ${selectedSimilarFaces.size} faces to ${person.name}.`,
        });
        setSelectedSimilarFaces(new Set());
        onPersonUpdated(); // Refresh parent list and current person's faces
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to add faces to person.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add faces to person.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveName = async () => {
    const newName = nameInput?.trim();
    if (!newName) {
      toast({ title: 'Error', description: 'Name cannot be empty.', variant: 'destructive' });
      return;
    }

    if (newName === person.name) {
      setIsEditingName(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      if (response.ok) {
        toast({ title: 'Success', description: `Renamed person to "${newName}".` });
        setIsEditingName(false);
        onPersonUpdated();
      } else {
        const err = await response.json();
        toast({ title: 'Error', description: err.error || 'Failed to update name', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to update name', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const removeFaceFromPerson = async (faceId: string) => {
    if (!confirm('Are you sure you want to remove this face from the person?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/faces/${faceId}/unassign`, {
        method: 'POST', // Using POST for unassign action
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Face removed from person.',
        });
        onPersonUpdated(); // Refresh parent list and current person's faces
      } else {
        const error = await response.json();
        toast({
          title: 'Error',
          description: error.error || 'Failed to remove face from person.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove face from person.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPossibleDuplicates = async () => {
    setLoadingDuplicates(true);
    try {
      const params = new URLSearchParams();
      if (duplicateThreshold !== null) params.set('threshold', String(duplicateThreshold));
      const res = await fetch(`/api/admin/people/${person.id}/possible-duplicates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateCandidates(data.duplicates || []);
        setUsedDuplicateThreshold(typeof data.usedThreshold === 'number' ? data.usedThreshold : null);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: err.error || 'Failed to load duplicates', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to load duplicates', variant: 'destructive' });
    } finally {
      setLoadingDuplicates(false);
    }
  };

  const toggleDuplicateSelection = (personId: string) => {
    setSelectedDuplicates(prev => {
      const s = new Set(prev);
      if (s.has(personId)) s.delete(personId); else s.add(personId);
      return s;
    });
  };

  const mergeSelectedDuplicates = async () => {
    if (selectedDuplicates.size === 0) {
      toast({ title: 'Error', description: 'Select at least one duplicate to merge', variant: 'destructive' });
      return;
    }
    if (!confirm(`Merge ${selectedDuplicates.size} selected person(s) into "${person.name}"? This will move all their faces and delete those person records.`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/people/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: person.id, sourceIds: Array.from(selectedDuplicates) }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: 'Merged', description: data.message || 'People merged successfully' });
        setSelectedDuplicates(new Set());
        // Refresh this person's details and surrounding lists
        onPersonUpdated();
        // Refresh duplicate list after merge
        fetchPossibleDuplicates();
      } else {
        const err = await res.json();
        toast({ title: 'Error', description: err.error || 'Failed to merge people', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to merge people', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const togglePersonFaceSelection = (faceId: string) => {
    setSelectedPersonFaces(prev => {
      const s = new Set(prev);
      if (s.has(faceId)) s.delete(faceId); else s.add(faceId);
      return s;
    });
  };

  const disableSelectedFaces = async () => {
    if (selectedPersonFaces.size === 0) return;
    setDisablingFaces(true);
    try {
      const res = await fetch('/api/admin/faces/ignore-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faceIds: Array.from(selectedPersonFaces) }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: 'Faces disabled', description: data.message || `Disabled ${selectedPersonFaces.size} face(s).` });
        setSelectedPersonFaces(new Set());
        onPersonUpdated();
      } else {
        const err = await res.json();
        toast({ title: 'Error', description: err.error || 'Failed to disable faces', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to disable faces', variant: 'destructive' });
    } finally {
      setDisablingFaces(false);
    }
  };

  const filteredFaces = person.faces.filter(face =>
    face.photo.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get unique photos where this person's faces appear
  const uniquePhotos = Array.from(new Map(person.faces.map(face => [face.photo.id, face.photo])).values());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {!isEditingName ? (
            <div className="flex items-center gap-2">
              <span>{person.name}</span>
              <Button variant="ghost" size="icon" onClick={() => setIsEditingName(true)}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="max-w-xs"
                disabled={loading}
                ref={nameInputRef}
              />
              <Button onClick={saveName} disabled={loading} className="flex items-center gap-2">
                <Save className="h-4 w-4" />
              </Button>
              <Button variant="ghost" onClick={() => { setIsEditingName(false); setNameInput(person.name); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <div>
            <Button
              variant={isConfirmed ? 'default' : 'secondary'}
              size="sm"
              onClick={toggleConfirmed}
              disabled={confirmLoading}
              className="text-sm flex items-center gap-1"
            >
              {confirmLoading ? (
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : isConfirmed ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
              {isConfirmed ? 'Confirmed' : 'Pending'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {person.faces.length} face{person.faces.length !== 1 ? 's' : ''}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Section for current faces */}
        <div>
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            Faces of {person.name}
            <Input
              placeholder="Search faces by filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs ml-auto"
            />
          </h3>
          {filteredFaces.length === 0 && searchQuery ? (
            <p className="text-muted-foreground text-center py-4">No faces found matching "{searchQuery}".</p>
          ) : filteredFaces.length === 0 && !searchQuery ? (
            <p className="text-muted-foreground text-center py-4">No faces assigned to this person yet.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Selected: {selectedPersonFaces.size}</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedPersonFaces(new Set(filteredFaces.map(f => f.id)))} disabled={filteredFaces.length === 0}>Select All</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPersonFaces(new Set())} disabled={selectedPersonFaces.size === 0}>Clear Selection</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={selectedPersonFaces.size === 0 || disablingFaces}>
                        {disablingFaces ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        Disable Selected
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disable selected faces?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark {selectedPersonFaces.size} face{selectedPersonFaces.size !== 1 ? 's' : ''} as disabled and remove them from this person. Disabled faces are hidden from unassigned lists and excluded from automatic grouping.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={disableSelectedFaces} className="bg-destructive hover:bg-destructive/90">Disable</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredFaces.map((face) => (
                  <div
                    key={face.id}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all ${selectedPersonFaces.has(face.id) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                    onClick={() => togglePersonFaceSelection(face.id)}
                  >
                    <div className="aspect-square bg-gray-100">
                      <img src={`/api/faces/${face.id}/serve`} alt={`Face from ${face.photo.filename}`} className="w-full h-full object-cover" />
                    </div>
                    {selectedPersonFaces.has(face.id) && (
                      <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded">{Math.round(face.confidence * 100)}%</div>
                    <p className="absolute top-1 left-1 text-white text-xs bg-black/70 px-1 py-0.5 rounded max-w-[calc(100%-10px)] truncate">{face.photo.filename}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Section for adding similar faces */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            Add Similar Faces
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Threshold
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={localThreshold ?? 0.7}
                  onChange={(e) => setLocalThreshold(parseFloat(e.target.value))}
                  className="w-28"
                />
                <span className="w-10 text-right">{Math.round((localThreshold ?? 0.7) * 100)}%</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSimilarFaces}
                disabled={loadingSimilar}
                className="flex items-center gap-2"
              >
                {loadingSimilar ? (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Find Similar
              </Button>
            </div>
          </h3>

          {loadingSimilar ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Searching for similar faces...</p>
            </div>
          ) : similarFaces.length === 0 ? (
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h4 className="font-medium mb-2">No Similar Faces Found</h4>
              <p className="text-muted-foreground">
                Click "Find Similar" to search for unassigned faces that might belong to this person.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Select faces to add to {person.name}. Selected: {selectedSimilarFaces.size}
                    </p>
                    {usedThreshold !== null && (
                      <p className="text-sm text-muted-foreground">Used threshold: {Math.round(usedThreshold * 100)}%</p>
                    )}
                  </div>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {similarFaces.map((face) => (
                  <div
                    key={face.id}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                      selectedSimilarFaces.has(face.id)
                        ? 'border-blue-500 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleSimilarFaceSelection(face.id)}
                  >
                    <div className="aspect-square bg-gray-100">
                      <img
                        src={`/api/faces/${face.id}/serve`}
                        alt={`Similar face from ${face.photo.filename}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {selectedSimilarFaces.has(face.id) && (
                      <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                        ✓
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                      {typeof (face as any).similarity === 'number'
                        ? `${Math.round((face as any).similarity * 100)}%`
                        : `${Math.round(face.confidence * 100)}%`}
                    </div>
                    <p className="absolute top-1 left-1 text-white text-xs bg-black/70 px-1 py-0.5 rounded max-w-[calc(100%-10px)] truncate">
                      {face.photo.filename}
                    </p>
                  </div>
                ))}
              </div>
              {selectedSimilarFaces.size > 0 && (
                <div className="flex justify-end mt-4">
                  <Button
                    onClick={addSelectedFacesToPerson}
                    disabled={loading}
                    className="flex items-center gap-2"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add {selectedSimilarFaces.size} Selected Face{selectedSimilarFaces.size !== 1 ? 's' : ''}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section for possible duplicates */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            Possible Duplicates
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Threshold
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={duplicateThreshold ?? 0.7}
                  onChange={(e) => setDuplicateThreshold(parseFloat(e.target.value))}
                  className="w-28"
                />
                <span className="w-10 text-right">{Math.round((duplicateThreshold ?? 0.7) * 100)}%</span>
              </div>
              <Button onClick={fetchPossibleDuplicates} disabled={loadingDuplicates} className="flex items-center gap-2">
                {loadingDuplicates ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Find Duplicates
              </Button>
            </div>
          </h3>

          {usedDuplicateThreshold !== null && (
            <p className="text-xs text-muted-foreground mb-2">Using threshold: {Math.round(usedDuplicateThreshold * 100)}%</p>
          )}

          {duplicateCandidates.length === 0 && !loadingDuplicates ? (
            <p className="text-muted-foreground text-center py-4">No duplicates found. Try lowering the threshold.</p>
          ) : (
            <div className="space-y-3">
              {duplicateCandidates.length > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Selected: {selectedDuplicates.size}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedDuplicates(new Set(duplicateCandidates.map(p => p.id)))} disabled={duplicateCandidates.length === 0}>Select All</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDuplicates(new Set())} disabled={selectedDuplicates.size === 0}>Clear</Button>
                    <Button onClick={mergeSelectedDuplicates} disabled={selectedDuplicates.size === 0 || loading} className="flex items-center gap-2">
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Merge {selectedDuplicates.size || ''} into {person.name}
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {duplicateCandidates.map((p) => (
                  <div
                    key={p.id}
                    className={`relative rounded-lg border-2 p-3 flex gap-3 cursor-pointer transition-all ${selectedDuplicates.has(p.id) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
                    onClick={() => toggleDuplicateSelection(p.id)}
                  >
                    <div className="relative w-16 h-16 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                      {p.previewFaceId ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/faces/${p.previewFaceId}/serve`} alt={p.name || 'Person preview'} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No preview</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{p.name || 'Unnamed person'}</span>
                        {p.confirmed ? (
                          <Badge variant="default" className="text-[10px]">Confirmed</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{p.faceCount} face{p.faceCount !== 1 ? 's' : ''}</div>
                      <div className="text-xs mt-1">Similarity: {Math.round(p.bestSimilarity * 100)}%</div>
                    </div>
                    {selectedDuplicates.has(p.id) && (
                      <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section for photos with this person */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            Photos with {person.name}
          </h3>
          {uniquePhotos.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No photos found with this person.</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {uniquePhotos.map((photo) => (
                <Link key={photo.id} href={`/albums/${photo.albumSlug}/photos/${photo.id}`} passHref>
                  <div className="relative group rounded-lg overflow-hidden border border-gray-200 cursor-pointer">
                    <div className="aspect-square bg-gray-100">
                      {photo.thumbnails.length > 0 && (
                        <img
                          src={`/api/photos/${photo.id}/serve?size=small`}
                          alt={photo.filename}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-2 py-1 truncate">
                      {photo.filename}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
