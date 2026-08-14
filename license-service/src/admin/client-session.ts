const ADMIN_CSRF_KEY = "baglab.admin.csrf";

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readAdminCsrf(storage: SessionStorageLike) {
  return storage.getItem(ADMIN_CSRF_KEY) ?? "";
}

export function saveAdminCsrf(storage: SessionStorageLike, token: string) {
  storage.setItem(ADMIN_CSRF_KEY, token);
}

export function clearAdminCsrf(storage: SessionStorageLike) {
  storage.removeItem(ADMIN_CSRF_KEY);
}
