import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, Settings, Users, Zap } from 'lucide-react';

interface FaceRecognitionSettingsProps {
  settings: {
    faceRecognitionEnabled: boolean;
    faceRecognitionPublicEnabled: boolean;
    faceRecognitionBatchSize: number;
    faceRecognitionParallelProcessing: number;
    faceRecognitionConfidenceThreshold: number;
    faceRecognitionSimilarityThreshold: number;
    peoplePageEnabled: boolean;
  };
  onUpdate: (settings: any) => void;
  loading?: boolean;
}

export function FaceRecognitionSettings({ 
  settings, 
  onUpdate, 
  loading = false 
}: FaceRecognitionSettingsProps) {
  const handleSettingChange = (key: string, value: any) => {
    onUpdate({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* Main Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Face Recognition System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="face-recognition-enabled" className="text-base font-medium">
                Enable Face Recognition
              </Label>
              <p className="text-sm text-muted-foreground">
                Enable automatic face detection and recognition in photos
              </p>
            </div>
            <Switch
              id="face-recognition-enabled"
              checked={settings.faceRecognitionEnabled}
              onCheckedChange={(checked) => 
                handleSettingChange('faceRecognitionEnabled', checked)
              }
              disabled={loading}
            />
          </div>

          {settings.faceRecognitionEnabled && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="face-recognition-public" className="text-base font-medium">
                    Public Face Recognition
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to see and interact with face recognition features
                  </p>
                </div>
                <Switch
                  id="face-recognition-public"
                  checked={settings.faceRecognitionPublicEnabled}
                  onCheckedChange={(checked) => 
                    handleSettingChange('faceRecognitionPublicEnabled', checked)
                  }
                  disabled={loading}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="people-page-enabled" className="text-base font-medium">
                    People Page
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Show a dedicated people section in the app
                  </p>
                </div>
                <Switch
                  id="people-page-enabled"
                  checked={settings.peoplePageEnabled}
                  onCheckedChange={(checked) => 
                    handleSettingChange('peoplePageEnabled', checked)
                  }
                  disabled={loading}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Processing Settings */}
      {settings.faceRecognitionEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Processing Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-base font-medium">
                Batch Size: {settings.faceRecognitionBatchSize} photos
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Number of photos to process simultaneously in each batch
              </p>
              <Slider
                value={[settings.faceRecognitionBatchSize]}
                onValueChange={([value]: number[]) => 
                  handleSettingChange('faceRecognitionBatchSize', value)
                }
                min={1}
                max={20}
                step={1}
                className="w-full"
                disabled={loading}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1</span>
                <span>20</span>
              </div>
            </div>

            <div>
              <Label className="text-base font-medium">
                Parallel Processing: {settings.faceRecognitionParallelProcessing} threads
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Number of parallel processing threads
              </p>
              <Slider
                value={[settings.faceRecognitionParallelProcessing]}
                onValueChange={([value]: number[]) => 
                  handleSettingChange('faceRecognitionParallelProcessing', value)
                }
                min={1}
                max={10}
                step={1}
                className="w-full"
                disabled={loading}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1</span>
                <span>10</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detection Settings */}
      {settings.faceRecognitionEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Detection Thresholds
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-base font-medium">
                Face Detection Confidence: {(settings.faceRecognitionConfidenceThreshold * 100).toFixed(0)}%
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Minimum confidence required to detect a face
              </p>
              <Slider
                value={[settings.faceRecognitionConfidenceThreshold]}
                onValueChange={([value]: number[]) => 
                  handleSettingChange('faceRecognitionConfidenceThreshold', value)
                }
                min={0.1}
                max={1.0}
                step={0.05}
                className="w-full"
                disabled={loading}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <Label className="text-base font-medium">
                Face Similarity Threshold: {(settings.faceRecognitionSimilarityThreshold * 100).toFixed(0)}%
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Minimum similarity required to match faces to the same person
              </p>
              <Slider
                value={[settings.faceRecognitionSimilarityThreshold]}
                onValueChange={([value]: number[]) => 
                  handleSettingChange('faceRecognitionSimilarityThreshold', value)
                }
                min={0.1}
                max={1.0}
                step={0.05}
                className="w-full"
                disabled={loading}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge variant={settings.faceRecognitionEnabled ? "default" : "secondary"}>
              {settings.faceRecognitionEnabled ? "Enabled" : "Disabled"}
            </Badge>
            {settings.faceRecognitionEnabled && settings.faceRecognitionPublicEnabled && (
              <Badge variant="outline">Public</Badge>
            )}
            {settings.faceRecognitionEnabled && settings.peoplePageEnabled && (
              <Badge variant="outline">People Page</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
