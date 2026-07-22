export interface TrackData {
  previewUrl: string;
  artworkUrl: string;
}

const cache = new Map<string, TrackData>();

function cleanQuery(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/- .*$/g, '')
    .trim();
}

export async function lookupPreview(title: string, artist: string): Promise<TrackData> {
  const cacheKey = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const cleanT = cleanQuery(title);
  const cleanA = cleanQuery(artist);
  const term = encodeURIComponent(`${cleanT} ${cleanA}`);

  try {
    const url = `https://itunes.apple.com/search?media=music&entity=song&limit=1&explicit=No&term=${term}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results[0]) {
        const track: TrackData = {
          previewUrl: data.results[0].previewUrl || '',
          artworkUrl: String(data.results[0].artworkUrl100 || '').replace('100x100', '600x600')
        };
        cache.set(cacheKey, track);
        return track;
      }
    }

    // Fallback: search title only
    if (cleanT) {
      const fallbackTerm = encodeURIComponent(cleanT);
      const fallbackUrl = `https://itunes.apple.com/search?media=music&entity=song&limit=1&explicit=No&term=${fallbackTerm}`;
      const res2 = await fetch(fallbackUrl);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2.results && data2.results[0]) {
          const track: TrackData = {
            previewUrl: data2.results[0].previewUrl || '',
            artworkUrl: String(data2.results[0].artworkUrl100 || '').replace('100x100', '600x600')
          };
          cache.set(cacheKey, track);
          return track;
        }
      }
    }
  } catch (e) {
    // Network or fetch error handled gracefully without throwing unhandled exceptions
  }

  const emptyTrack: TrackData = { previewUrl: '', artworkUrl: '' };
  cache.set(cacheKey, emptyTrack);
  return emptyTrack;
}

