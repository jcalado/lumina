'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Camera, Image, MapPin, Calendar, Info, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

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
  value: string | number | boolean | null | undefined;
  unit?: string;
}

function ExifField({ label, value, unit }: ExifFieldProps) {
  if (value === null || value === undefined || value === '') return null;
  const displayValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
  
  return (
    <div className="flex justify-between py-1 text-xs">
      <span className="text-muted-foreground font-medium">{label}:</span>
      <span className="text-right">
        {displayValue}
        {unit && <span className="text-muted-foreground ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function formatShutterSpeed(exposureTime: number): string {
  if (exposureTime >= 1) {
    return `${exposureTime}s`;
  } else {
    return `1/${Math.round(1 / exposureTime)}`;
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
  const t = useTranslations('PhotoExifInfo');

  // Move helper functions inside component to access translations
  const getOrientationDescription = (orientation?: number): string => {
    switch (orientation) {
      case 1: return t('orientation.normal');
      case 2: return t('orientation.mirroredHorizontal');
      case 3: return t('orientation.rotated180');
      case 4: return t('orientation.mirroredVertical');
      case 5: return t('orientation.mirroredHorizontalRotated270');
      case 6: return t('orientation.rotated90CW');
      case 7: return t('orientation.mirroredHorizontalRotated90');
      case 8: return t('orientation.rotated270CW');
      default: return t('orientation.unknown');
    }
  };

  const formatFileSizeLocalized = (bytes: number): string => {
    const unitKeys = ['fileSizeUnits.B', 'fileSizeUnits.KB', 'fileSizeUnits.MB', 'fileSizeUnits.GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < unitKeys.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${t(unitKeys[unitIndex])}`;
  };

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

  const copyrightInfo = {
    copyright: exifData.Copyright,
    artist: exifData.Artist,
    ownerName: exifData.OwnerName,
    userComment: exifData.UserComment,
  };

  // Get all other EXIF fields (raw data)
  // Build sets to avoid duplicating fields we already render explicitly
  const displayedTopLevelKeys = new Set<string>([
    // Basic
    'filename', 'size', 'takenAt', 'orientation',
    // Common custom
    'camera', 'lens', 'settings', 'gps',
    // Camera
    'Make', 'Model', 'LensModel', 'SerialNumber', 'OwnerName', 'Software',
    // Capture
    'ISO', 'FNumber', 'ExposureTime', 'FocalLength', 'ExposureProgram', 'MeteringMode', 'Flash', 'WhiteBalance', 'ExposureCompensation',
    // Image
    'ColorSpace', 'XResolution', 'YResolution', 'ResolutionUnit',
    // GPS
    'GPSLatitude', 'GPSLongitude',
    // Copyright
    'Copyright', 'Artist', 'UserComment',
  ]);

  // Group any object-valued top-level metadata keys into their own collapsible sections
  const objectGroups = Object.entries(exifData)
    .filter(([_, value]) => value && typeof value === 'object' && !Array.isArray(value)) as Array<[string, Record<string, any>]>;

  const groupOrder = (key: string) => {
    const k = key.toLowerCase();
    const weights: Record<string, number> = {
      exif: 1,
      exififd: 2,
      ifd0: 3,
      subifd: 4,
      tiff: 5,
      gps: 6,
      iptc: 7,
      xmp: 8,
      icc: 9,
      iccprofile: 9,
      makernote: 10,
      composite: 11,
      photoshop: 12,
      jfif: 13,
      quicktime: 14,
      png: 15,
      file: 16,
    };
    return weights[k] ?? 100;
  };

  const groupLabel = (key: string) => {
    const map: Record<string, string> = {
      exif: 'EXIF',
      exififd: 'EXIF',
      ifd0: 'IFD0 (TIFF)',
      subifd: 'SubIFD',
      tiff: 'TIFF',
      gps: 'GPS',
      iptc: 'IPTC',
      xmp: 'XMP',
      icc: 'ICC Profile',
      iccprofile: 'ICC Profile',
      makernote: 'Maker Notes',
      composite: 'Composite',
      photoshop: 'Photoshop',
      jfif: 'JFIF',
      quicktime: 'QuickTime',
      png: 'PNG',
      file: 'File',
    };
    const k = key.toLowerCase();
    return map[k] || key;
  };

  // Mark grouped keys as displayed to avoid duplication later
  for (const [k] of objectGroups) displayedTopLevelKeys.add(k);

  // Other top-level fields not covered by explicit sections or object groups
  const otherTopLevelEntries = Object.entries(exifData)
    .filter(([key]) => !displayedTopLevelKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card className="w-96 max-h-[80vh] overflow-hidden">
      <CardContent className="p-0">
        <div className="sticky top-0 bg-background border-b border-border p-3 z-10">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            {t('photoInformation')}
          </h3>
        </div>
        
        <div className="overflow-y-auto max-h-[calc(80vh-60px)]">
          {/* Basic Information */}
          <ExifSection
            title={t('basicInformation')}
            icon={<Image className="h-4 w-4" />}
            defaultExpanded={true}
          >
            <div className="space-y-1">
              <ExifField label={t('filename')} value={basicInfo.filename} />
              <ExifField label={t('fileSize')} value={basicInfo.size ? formatFileSizeLocalized(basicInfo.size) : null} />
              {basicInfo.takenAt && (
                <ExifField 
                  label={t('dateTaken')} 
                  value={new Date(basicInfo.takenAt).toLocaleString()} 
                />
              )}
              <ExifField 
                label={t('dateAdded')} 
                value={new Date(basicInfo.dateAdded).toLocaleString()} 
              />
              {basicInfo.orientation && (
                <ExifField 
                  label={t('orientation.label')} 
                  value={`${basicInfo.orientation} (${getOrientationDescription(basicInfo.orientation)})`} 
                />
              )}
            </div>
          </ExifSection>

          {/* Camera Information */}
          {(cameraInfo.make || cameraInfo.model || cameraInfo.camera || cameraInfo.lens) && (
            <ExifSection
              title={t('cameraAndLens')}
              icon={<Camera className="h-4 w-4" />}
              defaultExpanded={true}
            >
              <div className="space-y-1">
                {cameraInfo.camera ? (
                  <ExifField label={t('camera')} value={cameraInfo.camera} />
                ) : (
                  <>
                    <ExifField label={t('make')} value={cameraInfo.make} />
                    <ExifField label={t('model')} value={cameraInfo.model} />
                  </>
                )}
                <ExifField label={t('lens')} value={cameraInfo.lens} />
                <ExifField label={t('serialNumber')} value={cameraInfo.serialNumber} />
                <ExifField label={t('owner')} value={cameraInfo.ownerName} />
                <ExifField label={t('software')} value={cameraInfo.software} />
              </div>
            </ExifSection>
          )}

          {/* Capture Settings */}
          {(captureSettings.iso || captureSettings.aperture || captureSettings.exposureTime || captureSettings.focalLength) && (
            <ExifSection
              title={t('captureSettings')}
              icon={<Settings className="h-4 w-4" />}
              defaultExpanded={true}
            >
              <div className="space-y-1">
                <ExifField label={t('iso')} value={captureSettings.iso} />
                {captureSettings.aperture ? (
                  <ExifField label={t('aperture')} value={captureSettings.aperture} />
                ) : captureSettings.aperture && (
                  <ExifField label={t('aperture')} value={`f/${captureSettings.aperture}`} />
                )}
                {captureSettings.shutter ? (
                  <ExifField label={t('shutterSpeed')} value={captureSettings.shutter} />
                ) : captureSettings.exposureTime && (
                  <ExifField 
                    label={t('shutterSpeed')} 
                    value={formatShutterSpeed(captureSettings.exposureTime)} 
                  />
                )}
                {captureSettings.focalLength && (
                  <ExifField 
                    label={t('focalLength')} 
                    value={typeof captureSettings.focalLength === 'string' 
                      ? captureSettings.focalLength 
                      : `${captureSettings.focalLength}mm`
                    } 
                  />
                )}
                <ExifField label={t('exposureProgram')} value={captureSettings.exposureProgram} />
                <ExifField label={t('meteringMode')} value={captureSettings.meteringMode} />
                <ExifField label={t('flash')} value={captureSettings.flash} />
                <ExifField label={t('whiteBalance')} value={captureSettings.whiteBalance} />
                {captureSettings.exposureCompensation !== undefined && captureSettings.exposureCompensation !== 0 && (
                  <ExifField 
                    label={t('exposureCompensation')} 
                    value={`${captureSettings.exposureCompensation > 0 ? '+' : ''}${captureSettings.exposureCompensation} EV`} 
                  />
                )}
              </div>
            </ExifSection>
          )}

          {/* GPS Information */}
          {(gpsInfo.latitude || gpsInfo.longitude) && (
            <ExifSection
              title={t('location')}
              icon={<MapPin className="h-4 w-4" />}
            >
              <div className="space-y-1">
                <ExifField label={t('latitude')} value={gpsInfo.latitude?.toFixed(6)} />
                <ExifField label={t('longitude')} value={gpsInfo.longitude?.toFixed(6)} />
                {gpsInfo.latitude && gpsInfo.longitude && (
                  <div className="pt-2">
                    <a
                      href={`https://www.google.com/maps?q=${gpsInfo.latitude},${gpsInfo.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      {t('viewOnGoogleMaps')}
                    </a>
                  </div>
                )}
              </div>
            </ExifSection>
          )}

          {/* Image Details */}
          {(imageDetails.colorSpace || imageDetails.resolution) && (
            <ExifSection
              title={t('imageDetails')}
              icon={<Image className="h-4 w-4" />}
            >
              <div className="space-y-1">
                <ExifField label={t('colorSpace')} value={imageDetails.colorSpace === 1 ? t('colorSpace.sRGB') : imageDetails.colorSpace} />
                <ExifField label={t('resolution')} value={imageDetails.resolution} unit={imageDetails.resolutionUnit} />
              </div>
            </ExifSection>
          )}

          {/* Copyright Information */}
          {(copyrightInfo.copyright || copyrightInfo.artist || copyrightInfo.userComment) && (
            <ExifSection
              title={t('copyrightInfo')}
              icon={<Info className="h-4 w-4" />}
            >
              <div className="space-y-1">
                <ExifField label={t('copyright')} value={copyrightInfo.copyright} />
                <ExifField label={t('artist')} value={copyrightInfo.artist} />
                <ExifField label={t('userComment')} value={copyrightInfo.userComment} />
              </div>
            </ExifSection>
          )}

          {/* Structured metadata objects */}
          {objectGroups
            .sort(([a], [b]) => {
              const d = groupOrder(a) - groupOrder(b);
              return d !== 0 ? d : a.localeCompare(b);
            })
            .map(([key, obj]) => (
              <ExifSection
                key={key}
                title={`${groupLabel(key)} (${Object.keys(obj || {}).length})`}
                icon={<Info className="h-4 w-4" />}
              >
                <div className="space-y-1">
                  {Object.entries(obj || {})
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([subKey, subVal]) => (
                      <ExifField
                        key={subKey}
                        label={subKey}
                        value={
                          subVal === null || subVal === undefined
                            ? ''
                            : typeof subVal === 'object'
                              ? JSON.stringify(subVal)
                              : (subVal as any).toString()
                        }
                      />
                    ))}
                </div>
              </ExifSection>
            ))}

          {/* Other metadata fields not covered above */}
          {otherTopLevelEntries.length > 0 && (
            <ExifSection
              title={t('allExifData', { count: otherTopLevelEntries.length })}
              icon={<Info className="h-4 w-4" />}
            >
              <div className="space-y-1">
                {otherTopLevelEntries.map(([key, value]) => (
                  <ExifField
                    key={key}
                    label={key}
                    value={
                      value === null || value === undefined
                        ? ''
                        : typeof value === 'object'
                          ? JSON.stringify(value)
                          : (value as any).toString()
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
