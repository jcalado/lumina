'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Folder } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SearchResult {
  id: string;
  path: string;
  slug: string;
  name: string;
  description: string | null;
  photoCount: number;
  isSubAlbum: boolean;
  slugPath: string;
  createdAt: string;
  updatedAt: string;
}

interface SearchResponse {
  albums: SearchResult[];
  query: string;
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data: SearchResponse = await response.json();
          setResults(data.albums);
          setIsOpen(data.albums.length > 0);
          setSelectedIndex(-1);
        }
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < results.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            const selected = results[selectedIndex];
            handleSelectResult(selected);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSelectedIndex(-1);
          inputRef.current?.blur();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Handle clicks outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = (result: SearchResult) => {
    // Use the slugPath for navigation, which is the proper URL-friendly path
    router.push(`/albums/${result.slugPath}`);
    setQuery('');
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  const highlightMatch = (text: string, searchQuery: string) => {
    if (!searchQuery) return text;
    
    const regex = new RegExp(`(${searchQuery})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
          {part}
        </mark>
      ) : part
    );
  };

  return (
    <div ref={searchRef} className="relative w-80 max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search albums..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          className="pl-10 pr-4 h-9 text-sm"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin h-3 w-3 border border-gray-300 rounded-full border-t-transparent"></div>
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <Card className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto z-50 border shadow-lg">
          <div className="p-2">
            {results.map((result, index) => (
              <div
                key={result.id}
                className={`
                  flex items-start gap-3 p-3 rounded-md cursor-pointer transition-colors
                  ${index === selectedIndex 
                    ? 'bg-accent text-accent-foreground' 
                    : 'hover:bg-accent/50'
                  }
                `}
                onClick={() => handleSelectResult(result)}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Folder className="h-4 w-4 text-gray-500" />
                </div>
                
                <div className="flex-grow min-w-0">
                  <div className="font-medium text-sm leading-tight">
                    {highlightMatch(result.name, query)}
                  </div>
                  
                  {result.description && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {highlightMatch(result.description, query)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 border shadow-lg">
          <div className="p-4 text-center text-sm text-muted-foreground">
            No albums found for "{query}"
          </div>
        </Card>
      )}
    </div>
  );
}
