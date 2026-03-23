// localStorage abstraction with async interface (ready to swap to Supabase later)

const KEY = (username, trackId) => `cornerflash:${username}:progress:${trackId}`;

export async function saveProgress(cornerId, trackId, username, smData) {
  const all = await loadAllProgress(trackId, username);
  all[cornerId] = smData;
  localStorage.setItem(KEY(username, trackId), JSON.stringify(all));
}

export async function loadAllProgress(trackId, username) {
  const raw = localStorage.getItem(KEY(username, trackId));
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function resetProgress(trackId, username) {
  localStorage.removeItem(KEY(username, trackId));
}
