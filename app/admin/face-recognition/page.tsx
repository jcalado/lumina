'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { FaceRecognitionSettings } from '@/components/Admin/FaceRecognitionSettings';
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
  Trash2
} from 'lucide-react';

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
  previewFace?: {
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
  };
  createdAt: string;
  updatedAt: string;
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
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [lastJobStatus, setLastJobStatus] = useState<string | null>(null);
  const [unassignedFaces, setUnassignedFaces] = useState<UnassignedFace[]>([]);
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [selectedFaces, setSelectedFaces] = useState<Set<string>>(new Set());
  
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [deletingPerson, setDeletingPerson] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
    loadStatus();
    loadPeople();
    loadUnassignedFaces();
  }, []);

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

  const loadPeople = async () => {
    try {
      setPeopleLoading(true);
      const response = await fetch('/api/admin/people');
      if (response.ok) {
        const data = await response.json();
        setPeople(data.people || []);
      } else {
        console.error('Failed to load people');
      }
    } catch (error) {
      console.error('Failed to load people:', error);
    } finally {
      setPeopleLoading(false);
    }
  };

  const loadUnassignedFaces = async () => {
    try {
      setUnassignedLoading(true);
      const response = await fetch('/api/admin/people/unassigned');
      if (response.ok) {
        const data = await response.json();
        setUnassignedFaces(data.unassignedFaces || []);
      } else {
        console.error('Failed to load unassigned faces');
      }
    } catch (error) {
      console.error('Failed to load unassigned faces:', error);
    } finally {
      setUnassignedLoading(false);
    }
  };

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

    if (!newPersonName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a name for the person',
        variant: 'destructive',
      });
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
          name: newPersonName.trim(),
          faceIds: Array.from(selectedFaces),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: data.message || `Created person "${newPersonName}" with ${selectedFaces.size} faces`,
        });
        
        // Reset form
        setNewPersonName('');
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
          // Job completed, reload people data
          loadPeople();
        }
        
        setStatus(data);
        setLastJobStatus(data.status);
      }
    } catch (error) {
      console.error('Failed to load status:', error);
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

  const startProcessing = async () => {
    if (!settings.faceRecognitionEnabled) {
      toast({
        title: 'Error',
        description: 'Face recognition must be enabled first',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/admin/face-recognition', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: data.message || 'Face recognition processing started',
        });
        loadStatus();
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                            <p className="text-2xl font-bold">0</p>
                            <p className="text-sm text-muted-foreground">Photos Processed</p>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <p className="text-2xl font-bold">0</p>
                            <p className="text-sm text-muted-foreground">Faces Detected</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <Button 
                      onClick={startProcessing}
                      className="flex items-center gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Start Processing
                    </Button>
                    
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
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">
                      Face Recognition Required
                    </p>
                    <p className="text-sm text-yellow-600 dark:text-yellow-300">
                      Enable face recognition to manage people and faces
                    </p>
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
                  <p className="text-muted-foreground mb-4">
                    Start processing photos to detect and group faces into people
                  </p>
                  <Button onClick={startProcessing} className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    Start Face Detection
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Found {people.length} people with {people.reduce((total, person) => total + person.faceCount, 0)} faces
                    </p>
                    <Button
                      onClick={loadPeople}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Refresh
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {people.map((person) => (
                      <Card key={person.id} className="overflow-hidden">
                        <CardContent className="p-4">
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
                                <h4 className="font-medium truncate">{person.name}</h4>
                                {person.confirmed ? (
                                  <Badge variant="default" className="text-xs">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Confirmed
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
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
                              onClick={() => deletePerson(person.id.toString(), person.name)}
                              disabled={deletingPerson === person.id.toString()}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                            >
                              {deletingPerson === person.id.toString() ? (
                                <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Unassigned Faces Section */}
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium flex items-center gap-2">
                        <Grid3X3 className="h-5 w-5" />
                        Unassigned Faces
                      </h3>
                      
                    </div>

                    <Card>
                        <CardContent className="p-4">
                          {unassignedLoading ? (
                            <div className="text-center py-8">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                              <p className="text-muted-foreground">Loading unassigned faces...</p>
                            </div>
                          ) : unassignedFaces.length === 0 ? (
                            <div className="text-center py-8">
                              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                              <h4 className="font-medium mb-2">All Faces Assigned</h4>
                              <p className="text-muted-foreground">
                                All detected faces have been assigned to people
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {/* Create Person Form */}
                              {selectedFaces.size > 0 && (
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                  <h4 className="font-medium mb-3 flex items-center gap-2">
                                    <UserPlus className="h-4 w-4" />
                                    Create Person from {selectedFaces.size} Selected Faces
                                  </h4>
                                  <div className="flex items-end gap-3">
                                    <div className="flex-1">
                                      <label className="text-sm font-medium mb-1 block">
                                        Person Name
                                      </label>
                                      <Input
                                        placeholder="Enter person name..."
                                        value={newPersonName}
                                        onChange={(e) => setNewPersonName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            createPersonFromFaces();
                                          }
                                        }}
                                      />
                                    </div>
                                    <Button
                                      onClick={createPersonFromFaces}
                                      disabled={creatingPerson || !newPersonName.trim()}
                                      className="flex items-center gap-2"
                                    >
                                      {creatingPerson ? (
                                        <>
                                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                          Creating...
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="h-4 w-4" />
                                          Create Person
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      onClick={() => {
                                        setSelectedFaces(new Set());
                                        setNewPersonName('');
                                      }}
                                      variant="outline"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* Unassigned Faces Grid */}
                              <div>
                                <p className="text-sm text-muted-foreground mb-3">
                                  Click faces to select them for grouping into a person. Selected: {selectedFaces.size}
                                </p>
                                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                  {unassignedFaces.map((face) => (
                                    <div
                                      key={face.id}
                                      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                                        selectedFaces.has(face.id)
                                          ? 'border-blue-500 ring-2 ring-blue-200'
                                          : 'border-gray-200 hover:border-gray-300'
                                      }`}
                                      onClick={() => toggleFaceSelection(face.id)}
                                    >
                                      <div className="aspect-square bg-gray-100">
                                        <img
                                          src={`/api/faces/${face.id}/serve`}
                                          alt={`Face from ${face.photo.filename}`}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                      {/* Selection indicator */}
                                      {selectedFaces.has(face.id) && (
                                        <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                                          ✓
                                        </div>
                                      )}
                                      {/* Confidence badge */}
                                      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded">
                                        {Math.round(face.confidence * 100)}%
                                      </div>
                                    </div>
                                  ))}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
