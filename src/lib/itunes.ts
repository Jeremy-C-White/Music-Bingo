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
// Songs that failed only because of a temporary problem (rate limit, network
// blip). Briefly remembered so lists like the host's call history don't keep
// hammering iTunes, which is limited to roughly 20 searches per minute.
const cooldownUntil = new Map<string, number>();
const EMPTY_TRACK: TrackData = { previewUrl: '', artworkUrl: '' };
// Waits before each retry of a temporary failure (about 12 seconds in total).
const RETRY_DELAYS_MS = [1500, 3500, 7000];
const COOLDOWN_MS = 30_000;

/** A temporary failure (rate limit, network) as opposed to "no preview exists". */
class TransientLookupError extends Error {}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    // iTunes answers rate-limited requests without CORS headers, so the
    // browser reports them as a network error rather than a 403.
    throw new TransientLookupError(String(error));
  }
  if (!response.ok) throw new TransientLookupError(`iTunes search returned ${response.status}`);
  const data = await response.json() as { results?: ItunesResult[] };
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchPreview(title: string, artist: string): Promise<TrackData> {
  const cleanTitle = cleanQuery(title);
  const cleanArtist = cleanQuery(artist);

  // Throws TransientLookupError on a temporary failure so the caller can retry;
  // returns EMPTY_TRACK only when iTunes answered and truly has no preview.
  let result = chooseBestResult(await search(`${cleanTitle} ${cleanArtist}`), cleanTitle, cleanArtist);
  if (!result && cleanTitle) {
    result = chooseBestResult(await search(cleanTitle), cleanTitle, cleanArtist);
  }
  if (!result) return EMPTY_TRACK;

  return {
    previewUrl: result.previewUrl || '',
    artworkUrl: String(result.artworkUrl100 || '').replace('100x100', '600x600'),
  };
}

async function fetchPreviewWithRetry(title: string, artist: string): Promise<TrackData> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchPreview(title, artist);
    } catch (error) {
      if (!(error instanceof TransientLookupError) || attempt >= RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
}

export async function lookupPreview(title: string, artist: string): Promise<TrackData> {
  const cacheKey = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const inFlight = pending.get(cacheKey);
  if (inFlight) return inFlight;
  if ((cooldownUntil.get(cacheKey) ?? 0) > Date.now()) return EMPTY_TRACK;

  const request = fetchPreviewWithRetry(title, artist)
    .then(track => {
      // A definitive answer (found, or iTunes has no preview) is kept for the session.
      cache.set(cacheKey, track);
      return track;
    })
    .catch(() => {
      cooldownUntil.set(cacheKey, Date.now() + COOLDOWN_MS);
      return EMPTY_TRACK;
    })
    .finally(() => pending.delete(cacheKey));
  pending.set(cacheKey, request);
  return request;
}
