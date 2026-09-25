export interface TrackData {
  previewUrl: string;
  artworkUrl: string;
}

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

const cache = new Map<string, TrackData>();
const pending = new Map<string, Promise<TrackData>>();
const EMPTY_TRACK: TrackData = { previewUrl: '', artworkUrl: '' };

function cleanQuery(text: string): string {
  return text
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/- .*$/g, '')
    .trim();
}

function normalize(text = ''): string {
  return cleanQuery(text)
    .toLowerCase()
    .replace(/\b(feat|featuring|ft)\.?\b.*$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function chooseBestResult(results: ItunesResult[], title: string, artist: string): ItunesResult | null {
  const wantedTitle = normalize(title);
  const wantedArtist = normalize(artist);
  const playable = results.filter(result => Boolean(result.previewUrl));

  return playable
    .map(result => {
      const resultTitle = normalize(result.trackName);
      const resultArtist = normalize(result.artistName);
      let score = 0;
      if (resultTitle === wantedTitle) score += 8;
      else if (resultTitle.includes(wantedTitle) || wantedTitle.includes(resultTitle)) score += 4;
      if (resultArtist === wantedArtist) score += 6;
      else if (resultArtist.includes(wantedArtist) || wantedArtist.includes(resultArtist)) score += 3;
      return { result, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.result ?? null;
}

async function search(term: string): Promise<ItunesResult[]> {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=5&explicit=No&term=${encodeURIComponent(term)}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json() as { results?: ItunesResult[] };
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchPreview(title: string, artist: string): Promise<TrackData> {
  const cleanTitle = cleanQuery(title);
  const cleanArtist = cleanQuery(artist);

  try {
    let result = chooseBestResult(await search(`${cleanTitle} ${cleanArtist}`), cleanTitle, cleanArtist);
    if (!result && cleanTitle) {
      result = chooseBestResult(await search(cleanTitle), cleanTitle, cleanArtist);
    }
    if (!result) return EMPTY_TRACK;

    return {
      previewUrl: result.previewUrl || '',
      artworkUrl: String(result.artworkUrl100 || '').replace('100x100', '600x600'),
    };
  } catch {
    // A temporary network problem should not poison the cache; a later attempt
    // can retry the lookup normally.
    return EMPTY_TRACK;
  }
}

export async function lookupPreview(title: string, artist: string): Promise<TrackData> {
  const cacheKey = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const inFlight = pending.get(cacheKey);
  if (inFlight) return inFlight;

  const request = fetchPreview(title, artist)
    .then(track => {
      if (track.previewUrl) cache.set(cacheKey, track);
      return track;
    })
    .finally(() => pending.delete(cacheKey));
  pending.set(cacheKey, request);
  return request;
}
