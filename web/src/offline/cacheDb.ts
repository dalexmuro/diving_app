import {
  type Buddy,
  type Certification,
  type DiveCenter,
  type DiveComputer,
  type DiveDetail,
  type DiveSite,
  type DiveSummary,
  type GearItem,
  type GlobalStats,
  type UserSettings,
} from '../types/domain';

const DB_NAME = 'diving-app-offline-v1';
const DB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_DIVE_DETAILS = 'diveDetails';

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
      if (!db.objectStoreNames.contains(STORE_DIVE_DETAILS)) {
        db.createObjectStore(STORE_DIVE_DETAILS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readonly');
    const req = tx.objectStore(STORE_KV).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, 'readwrite');
    tx.objectStore(STORE_KV).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const offlineCache = {
  getDives: () => kvGet<DiveSummary[]>('dives'),
  setDives: (dives: DiveSummary[]) => kvSet('dives', dives),

  getStats: () => kvGet<GlobalStats>('stats'),
  setStats: (stats: GlobalStats) => kvSet('stats', stats),

  getSites: () => kvGet<DiveSite[]>('sites'),
  setSites: (sites: DiveSite[]) => kvSet('sites', sites),

  getCenters: () => kvGet<DiveCenter[]>('centers'),
  setCenters: (centers: DiveCenter[]) => kvSet('centers', centers),

  getBuddies: () => kvGet<Buddy[]>('buddies'),
  setBuddies: (buddies: Buddy[]) => kvSet('buddies', buddies),

  getComputers: () => kvGet<DiveComputer[]>('computers'),
  setComputers: (computers: DiveComputer[]) => kvSet('computers', computers),

  getGear: () => kvGet<GearItem[]>('gear'),
  setGear: (gear: GearItem[]) => kvSet('gear', gear),

  getCertifications: () => kvGet<Certification[]>('certifications'),
  setCertifications: (certs: Certification[]) => kvSet('certifications', certs),

  getSettings: () => kvGet<UserSettings>('settings'),
  setSettings: (settings: UserSettings) => kvSet('settings', settings),

  async getDiveDetail(id: string): Promise<DiveDetail | null> {
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIVE_DETAILS, 'readonly');
      const req = tx.objectStore(STORE_DIVE_DETAILS).get(id);
      req.onsuccess = () => resolve((req.result as DiveDetail | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  },

  async setDiveDetail(detail: DiveDetail): Promise<void> {
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIVE_DETAILS, 'readwrite');
      tx.objectStore(STORE_DIVE_DETAILS).put(detail);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteDiveDetail(id: string): Promise<void> {
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DIVE_DETAILS, 'readwrite');
      tx.objectStore(STORE_DIVE_DETAILS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async hasCachedData(): Promise<boolean> {
    const dives = await kvGet<DiveSummary[]>('dives');
    return Array.isArray(dives) && dives.length > 0;
  },
};
