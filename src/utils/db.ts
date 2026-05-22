const DB_NAME = 'WorkbarDB';
const DB_VERSION = 3; // Bumped for apps store and updated virtual_folders

export interface Project {
  id: string;
  name: string;
  parentId: string | null;
  order?: number;
  active?: boolean;
}

export interface VirtualFolder {
  id: string;
  name: string;
  baseName: string | null;
  handle: FileSystemDirectoryHandle;
  projectId: string | null;
  order?: number;
  active?: boolean;
}

export interface AppLink {
  id: string;
  name: string;
  url: string;
  projectId: string | null;
}

const STORES = {
  PROJECTS: 'projects',
  VIRTUAL_FOLDERS: 'virtual_folders',
  APPS: 'apps'
};

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(STORES.PROJECTS)) {
        db.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(STORES.VIRTUAL_FOLDERS)) {
        db.createObjectStore(STORES.VIRTUAL_FOLDERS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.APPS)) {
        db.createObjectStore(STORES.APPS, { keyPath: 'id' });
      }
    };
  });
}

// Projects
export async function getProjects(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.PROJECTS, 'readonly');
    const store = transaction.objectStore(STORES.PROJECTS);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveProject(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.PROJECTS, 'readwrite');
    const store = transaction.objectStore(STORES.PROJECTS);
    const request = store.put(project);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.PROJECTS, 'readwrite');
    const store = transaction.objectStore(STORES.PROJECTS);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Virtual Folders
export async function getVirtualFolders(): Promise<VirtualFolder[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.VIRTUAL_FOLDERS, 'readonly');
    const store = transaction.objectStore(STORES.VIRTUAL_FOLDERS);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveVirtualFolder(folder: VirtualFolder): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.VIRTUAL_FOLDERS, 'readwrite');
    const store = transaction.objectStore(STORES.VIRTUAL_FOLDERS);
    const request = store.put(folder);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteVirtualFolder(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.VIRTUAL_FOLDERS, 'readwrite');
    const store = transaction.objectStore(STORES.VIRTUAL_FOLDERS);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Apps
export async function getApps(): Promise<AppLink[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.APPS, 'readonly');
    const store = transaction.objectStore(STORES.APPS);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveApp(app: AppLink): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.APPS, 'readwrite');
    const store = transaction.objectStore(STORES.APPS);
    const request = store.put(app);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function deleteApp(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.APPS, 'readwrite');
    const store = transaction.objectStore(STORES.APPS);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
