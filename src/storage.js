// localStorage abstraction with async interface (ready to swap to Supabase later)

const KEY = (trackId) => `cornerflash:progress:${trackId}`;

export async function saveProgress(cornerId, trackId, smData) {
  const all = await loadAllProgress(trackId);
  all[cornerId] = smData;
  localStorage.setItem(KEY(trackId), JSON.stringify(all));
}

export async function loadAllProgress(trackId) {
  const raw = localStorage.getItem(KEY(trackId));
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function resetProgress(trackId) {
  localStorage.removeItem(KEY(trackId));
}
