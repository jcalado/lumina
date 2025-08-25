'use client';

import { useState, useEffect } from 'react';
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
  XCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';

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

  useEffect(() => {
    // When person changes, clear similar faces and selections
    setSimilarFaces([]);
    setSelectedSimilarFaces(new Set());
    setSearchQuery('');
  }, [person.id]);

  const fetchSimilarFaces = async () => {
    setLoadingSimilar(true);
    try {
      const response = await fetch(`/api/admin/people/${person.id}/similar-faces`);
      if (response.ok) {
        const data = await response.json();
        setSimilarFaces(data.similarFaces || []);
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

  const filteredFaces = person.faces.filter(face =>
    face.photo.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {person.name}
        </CardTitle>
        <div className="flex items-center gap-2">
          {person.confirmed ? (
            <Badge variant="default" className="text-sm">
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirmed
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-sm">
              <Clock className="h-4 w-4 mr-1" />
              Pending
            </Badge>
          )}
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
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredFaces.map((face) => (
                <div key={face.id} className="relative group rounded-lg overflow-hidden border border-gray-200">
                  <div className="aspect-square bg-gray-100">
                    <img
                      src={`/api/faces/${face.id}/serve`}
                      alt={`Face from ${face.photo.filename}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => removeFaceFromPerson(face.id)}
                      disabled={loading}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                    {Math.round(face.confidence * 100)}%
                  </div>
                  <p className="absolute top-1 left-1 text-white text-xs bg-black/70 px-1 py-0.5 rounded max-w-[calc(100%-10px)] truncate">
                    {face.photo.filename}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section for adding similar faces */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            Add Similar Faces
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSimilarFaces}
              disabled={loadingSimilar}
              className="ml-auto flex items-center gap-2"
            >
              {loadingSimilar ? (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Find Similar
            </Button>
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
              <p className="text-sm text-muted-foreground">
                Select faces to add to {person.name}. Selected: {selectedSimilarFaces.size}
              </p>
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
                      {Math.round(face.confidence * 100)}%
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
      </CardContent>
    </Card>
  );
}
