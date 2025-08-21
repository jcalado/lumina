'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Camera, Image, MapPin, Calendar, Info, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ExifData {
  // Basic info
  filename?: string;
  size?: number;
  takenAt?: string;
  camera?: string;
  lens?: string;
  orientation?: number;
  
  // Camera settings
  settings?: {
    iso?: number;
    aperture?: string;
    shutter?: string;
    focalLength?: string;
  };
  
  // GPS data
  gps?: {
    latitude?: number;
    longitude?: number;
  };
  
  // Raw EXIF data (everything else)
  [key: string]: any;
}

interface ExifSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function ExifSection({ title, icon, children, defaultExpanded = false }: ExifSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between p-2 h-auto font-medium text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm">{title}</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
      {isExpanded && (
        <div className="px-2 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

interface ExifFieldProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
}

function ExifField({ label, value, unit }: ExifFieldProps) {
  if (value === null || value === undefined || value === '') return null;
  
  return (
    <div className="flex justify-between py-1 text-xs">
      <span className="text-muted-foreground font-medium">{label}:</span>
      <span className="text-right">
        {value}
        {unit && <span className="text-muted-foreground ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatShutterSpeed(exposureTime: number): string {
  if (exposureTime >= 1) {
    return `${exposureTime}s`;
  } else {
    return `1/${Math.round(1 / exposureTime)}`;
  }
}

function getOrientationDescription(orientation?: number): string {
  switch (orientation) {
    case 1: return 'Normal';
    case 2: return 'Mirrored horizontal';
    case 3: return 'Rotated 180°';
    case 4: return 'Mirrored vertical';
    case 5: return 'Mirrored horizontal, rotated 270°';
    case 6: return 'Rotated 90° CW';
    case 7: return 'Mirrored horizontal, rotated 90°';
    case 8: return 'Rotated 270° CW';
    default: return 'Unknown';
  }
}

interface PhotoExifInfoProps {
  photo: {
    id: string;
    filename: string;
    fileSize: number;
    takenAt?: string | null;
    createdAt: string;
    metadata?: string | ExifData | null;
    orientation?: number;
  };
}

export function PhotoExifInfo({ photo }: PhotoExifInfoProps) {
  // Parse metadata
  let exifData: ExifData = {};
  if (photo.metadata) {
    try {
      exifData = typeof photo.metadata === 'string' 
        ? JSON.parse(photo.metadata) 
        : photo.metadata;
    } catch (error) {
      console.error('Failed to parse photo metadata:', error);
    }
  }

  // Extract structured data
  const basicInfo = {
    filename: photo.filename,
    size: photo.fileSize,
    takenAt: photo.takenAt || exifData.takenAt,
    dateAdded: photo.createdAt,
    orientation: photo.orientation || exifData.orientation,
  };

  const cameraInfo = {
    make: exifData.Make,
    model: exifData.Model,
    camera: exifData.camera,
    lens: exifData.lens || exifData.LensModel,
    serialNumber: exifData.SerialNumber,
    ownerName: exifData.OwnerName,
    software: exifData.Software,
  };

  const captureSettings = {
    iso: exifData.ISO || exifData.settings?.iso,
    aperture: exifData.FNumber || exifData.settings?.aperture,
    exposureTime: exifData.ExposureTime,
    shutter: exifData.settings?.shutter,
    focalLength: exifData.FocalLength || exifData.settings?.focalLength,
    exposureProgram: exifData.ExposureProgram,
    meteringMode: exifData.MeteringMode,
    flash: exifData.Flash,
    whiteBalance: exifData.WhiteBalance,
    exposureCompensation: exifData.ExposureCompensation,
  };

  const imageDetails = {
    colorSpace: exifData.ColorSpace,
    resolution: exifData.XResolution && exifData.YResolution 
      ? `${exifData.XResolution} × ${exifData.YResolution}` 
      : null,
    resolutionUnit: exifData.ResolutionUnit,
    orientation: basicInfo.orientation,
  };

  const gpsInfo = {
    latitude: exifData.GPSLatitude || exifData.gps?.latitude,
    longitude: exifData.GPSLongitude || exifData.gps?.longitude,
  };

  // Get all other EXIF fields (raw data)
  const excludedFields = new Set([
    'filename', 'size', 'takenAt', 'camera', 'lens', 'settings', 'gps', 'orientation',
    'Make', 'Model', 'LensModel', 'SerialNumber', 'OwnerName', 'Software',
    'ISO', 'FNumber', 'ExposureTime', 'FocalLength', 'ExposureProgram', 'MeteringMode',
    'Flash', 'WhiteBalance', 'ExposureCompensation', 'ColorSpace', 'XResolution',
    'YResolution', 'ResolutionUnit', 'GPSLatitude', 'GPSLongitude'
  ]);

  const rawExifData = Object.entries(exifData)
    .filter(([key]) => !excludedFields.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card className="w-96 max-h-[80vh] overflow-hidden">
      <CardContent className="p-0">
        <div className="sticky top-0 bg-background border-b border-border p-3 z-10">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            Photo Information
          </h3>
        </div>
        
        <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
          {/* Basic Information */}
          <ExifSection
            title="Basic Information"
            icon={<Image className="h-4 w-4" />}
            defaultExpanded={true}
          >
            <div className="space-y-1">
              <ExifField label="Filename" value={basicInfo.filename} />
              <ExifField label="File Size" value={basicInfo.size ? formatFileSize(basicInfo.size) : null} />
              {basicInfo.takenAt && (
                <ExifField 
                  label="Date Taken" 
                  value={new Date(basicInfo.takenAt).toLocaleString()} 
                />
              )}
              <ExifField 
                label="Date Added" 
                value={new Date(basicInfo.dateAdded).toLocaleString()} 
              />
              {basicInfo.orientation && (
                <ExifField 
                  label="Orientation" 
                  value={`${basicInfo.orientation} (${getOrientationDescription(basicInfo.orientation)})`} 
                />
              )}
            </div>
          </ExifSection>

          {/* Camera Information */}
          {(cameraInfo.make || cameraInfo.model || cameraInfo.camera || cameraInfo.lens) && (
            <ExifSection
              title="Camera & Lens"
              icon={<Camera className="h-4 w-4" />}
              defaultExpanded={true}
            >
              <div className="space-y-1">
                {cameraInfo.camera ? (
                  <ExifField label="Camera" value={cameraInfo.camera} />
                ) : (
                  <>
                    <ExifField label="Make" value={cameraInfo.make} />
                    <ExifField label="Model" value={cameraInfo.model} />
                  </>
                )}
                <ExifField label="Lens" value={cameraInfo.lens} />
                <ExifField label="Serial Number" value={cameraInfo.serialNumber} />
                <ExifField label="Owner" value={cameraInfo.ownerName} />
                <ExifField label="Software" value={cameraInfo.software} />
              </div>
            </ExifSection>
          )}

          {/* Capture Settings */}
          {(captureSettings.iso || captureSettings.aperture || captureSettings.exposureTime || captureSettings.focalLength) && (
            <ExifSection
              title="Capture Settings"
              icon={<Settings className="h-4 w-4" />}
              defaultExpanded={true}
            >
              <div className="space-y-1">
                <ExifField label="ISO" value={captureSettings.iso} />
                {captureSettings.aperture ? (
                  <ExifField label="Aperture" value={captureSettings.aperture} />
                ) : captureSettings.aperture && (
                  <ExifField label="Aperture" value={`f/${captureSettings.aperture}`} />
                )}
                {captureSettings.shutter ? (
                  <ExifField label="Shutter Speed" value={captureSettings.shutter} />
                ) : captureSettings.exposureTime && (
                  <ExifField 
                    label="Shutter Speed" 
                    value={formatShutterSpeed(captureSettings.exposureTime)} 
                  />
                )}
                {captureSettings.focalLength && (
                  <ExifField 
                    label="Focal Length" 
                    value={typeof captureSettings.focalLength === 'string' 
                      ? captureSettings.focalLength 
                      : `${captureSettings.focalLength}mm`
                    } 
                  />
                )}
                <ExifField label="Exposure Program" value={captureSettings.exposureProgram} />
                <ExifField label="Metering Mode" value={captureSettings.meteringMode} />
                <ExifField label="Flash" value={captureSettings.flash} />
                <ExifField label="White Balance" value={captureSettings.whiteBalance} />
                {captureSettings.exposureCompensation !== undefined && captureSettings.exposureCompensation !== 0 && (
                  <ExifField 
                    label="Exposure Compensation" 
                    value={`${captureSettings.exposureCompensation > 0 ? '+' : ''}${captureSettings.exposureCompensation} EV`} 
                  />
                )}
              </div>
            </ExifSection>
          )}

          {/* GPS Information */}
          {(gpsInfo.latitude || gpsInfo.longitude) && (
            <ExifSection
              title="Location"
              icon={<MapPin className="h-4 w-4" />}
            >
              <div className="space-y-1">
                <ExifField label="Latitude" value={gpsInfo.latitude?.toFixed(6)} />
                <ExifField label="Longitude" value={gpsInfo.longitude?.toFixed(6)} />
                {gpsInfo.latitude && gpsInfo.longitude && (
                  <div className="pt-2">
                    <a
                      href={`https://www.google.com/maps?q=${gpsInfo.latitude},${gpsInfo.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      View on Google Maps
                    </a>
                  </div>
                )}
              </div>
            </ExifSection>
          )}

          {/* Image Details */}
          {(imageDetails.colorSpace || imageDetails.resolution) && (
            <ExifSection
              title="Image Details"
              icon={<Image className="h-4 w-4" />}
            >
              <div className="space-y-1">
                <ExifField label="Color Space" value={imageDetails.colorSpace === 1 ? 'sRGB' : imageDetails.colorSpace} />
                <ExifField label="Resolution" value={imageDetails.resolution} unit={imageDetails.resolutionUnit} />
              </div>
            </ExifSection>
          )}

          {/* Raw EXIF Data */}
          {rawExifData.length > 0 && (
            <ExifSection
              title={`All EXIF Data (${rawExifData.length} fields)`}
              icon={<Info className="h-4 w-4" />}
            >
              <div className="space-y-1">
                {rawExifData.map(([key, value]) => (
                  <ExifField 
                    key={key} 
                    label={key} 
                    value={
                      typeof value === 'object' 
                        ? JSON.stringify(value)
                        : String(value)
                    } 
                  />
                ))}
              </div>
            </ExifSection>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
