import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import './App.css'
import { getProjects, saveProject, deleteProject, getVirtualFolders, saveVirtualFolder, deleteVirtualFolder, getApps, saveApp, deleteApp } from './utils/db'
import type { Project, VirtualFolder, AppLink } from './utils/db'

interface StagedImage {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  projectId: string | null;
}

interface RecentDownload {
  id: number;
  url: string;
  name: string;
  state: string;
  mimeType: string;
  projectId: string | null;
}

interface SiteMappings {
  [domain: string]: string | null;
}

interface TabMappings {
  [tabId: string]: string | null;
}

interface ModalState {
  type: 'project' | 'app' | 'editApp' | 'virtualFolder' | 'editVirtualFolder' | 'renameImage' | 'renameDownload' | null;
  data?: Project | AppLink | VirtualFolder | StagedImage | RecentDownload | null;
}

function App() {
  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [images, setImages] = useState<StagedImage[]>([]);
  const [virtualFolders, setVirtualFolders] = useState<VirtualFolder[]>([]);
  const [apps, setApps] = useState<AppLink[]>([]);
  const [recentDownloads, setRecentDownloads] = useState<RecentDownload[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAppsMode, setIsAppsMode] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<{ id: string, type: 'project' | 'virtualFolder', position: 'left' | 'right' } | null>(null);

  // Sync ref with state for listeners
  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);
  
  // Modal State
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [formData, setFormData] = useState({ name: '', url: '', baseName: '' });

  // Helpers
  const getFileName = useCallback((path: string | undefined): string => {
    if (!path) return 'image';
    return path.split(/[\\/]/).filter(Boolean).pop() || 'image';
  }, []);

  const getExtensionFromMime = useCallback((mime: string): string => {
    switch (mime) {
      case 'image/jpeg': return 'jpg';
      case 'image/png': return 'png';
      case 'image/webp': return 'webp';
      case 'image/gif': return 'gif';
      case 'image/svg+xml': return 'svg';
      case 'image/bmp': return 'bmp';
      default: return 'png';
    }
  }, []);

  const getDomain = useCallback((url: string | undefined): string | null => {
    if (!url || !url.startsWith('http')) return null;
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch { return null; }
  }, []);

  const addImage = useCallback(async (url: string, name: string) => {
    let finalUrl = url;
    let mimeType = 'image/png';
    if (url.startsWith('http')) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        mimeType = blob.type;
        finalUrl = await new Promise((res) => {
          const reader = new FileReader();
          reader.onloadend = () => res(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (err) { console.warn(err); }
    } else if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;]+);/);
      if (match) mimeType = match[1];
    }

    const newImage: StagedImage = {
      id: crypto.randomUUID(),
      url: finalUrl,
      name: name || `image-${Date.now()}`,
      mimeType,
      projectId: currentProjectId
    };
    setImages(prev => [newImage, ...prev]);
  }, [currentProjectId]);

  const handleTabChange = useCallback((tabId?: number) => {
    const processTab = (tab: chrome.tabs.Tab) => {
      if (!tab?.id) return;
      const domain = getDomain(tab.url);

      // 1. Check tab-specific mapping (session)
      if (chrome.storage.session) {
        chrome.storage.session.get(['tab_mappings'], (res) => {
          const tabMappings = (res.tab_mappings || {}) as TabMappings;
          const tid = tab.id!.toString();
          
          if (tabMappings[tid] !== undefined) {
            setCurrentProjectId(tabMappings[tid]);
          } else if (domain) {
            // 2. Fallback to domain mapping (local)
            chrome.storage.local.get(['site_mappings'], (sres) => {
              const mappings = (sres.site_mappings || {}) as SiteMappings;
              if (mappings[domain] !== undefined) {
                setCurrentProjectId(mappings[domain]);
              }
            });
          }
        });
      } else {
        // Fallback for environments without storage.session
        chrome.storage.local.get(['site_mappings'], (sres) => {
          const mappings = (sres.site_mappings || {}) as SiteMappings;
          if (domain && mappings[domain] !== undefined) {
            setCurrentProjectId(mappings[domain]);
          }
        });
      }
    };

    if (tabId) {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) return;
        processTab(tab);
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) processTab(tabs[0]);
      });
    }
  }, [getDomain]);

  // Lifecycle & Site Awareness
  useEffect(() => {
    // Initial Load
    chrome.storage.local.get(['workbar_images'], (result) => {
      if (result.workbar_images) setImages(result.workbar_images as StagedImage[]);
    });

    getProjects().then(setProjects).catch(console.error);
    getVirtualFolders().then(setVirtualFolders).catch(console.error);
    getApps().then(setApps).catch(console.error);

    // Initial check
    handleTabChange();

    const onActivated = (activeInfo: { tabId: number }) => handleTabChange(activeInfo.tabId);
    const onUpdated = (id: number, changeInfo: { status?: string, url?: string }) => {
      if (changeInfo.status === 'complete' || changeInfo.url) handleTabChange(id);
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    // Downloads
    const handleDownloadCreated = (item: chrome.downloads.DownloadItem) => {
      const isImage = item.mime?.startsWith('image/') || item.filename?.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i);
      if (isImage) {
        const url = item.url || item.finalUrl;
        const name = item.filename ? getFileName(item.filename) : 'downloading...';
        const newDownload: RecentDownload = { 
          id: item.id, 
          url, 
          name, 
          state: item.state, 
          mimeType: item.mime || 'image/png',
          projectId: currentProjectIdRef.current
        };
        setRecentDownloads(prev => [newDownload, ...prev].slice(0, 20));
        if (url.startsWith('http')) {
          chrome.runtime.sendMessage({ type: 'get-file-data', url }, (response) => {
            if (response?.dataUrl) {
              setRecentDownloads(prev => prev.map(dl => dl.id === item.id ? { ...dl, url: response.dataUrl } : dl));
            }
          });
        }
      }
    };

    const handleDownloadChanged = (delta: chrome.downloads.DownloadDelta) => {
      setRecentDownloads(prev => prev.map(dl => {
        if (dl.id === delta.id) {
          const newState = delta.state ? delta.state.current : dl.state;
          const newName = delta.filename?.current ? getFileName(delta.filename.current) : dl.name;
          const newMime = delta.mime ? delta.mime.current : dl.mimeType;
          if (delta.state?.current === 'complete') {
            chrome.downloads.search({ id: delta.id }, (items) => {
              const item = items[0];
              if (item?.exists) {
                chrome.runtime.sendMessage({ type: 'get-file-data', url: `file://${item.filename}` }, (response) => {
                  if (response?.dataUrl) {
                    setRecentDownloads(current => current.map(d => 
                      d.id === delta.id ? { ...d, url: response.dataUrl, name: getFileName(item.filename), mimeType: item.mime || d.mimeType } : d
                    ));
                  }
                });
              }
            });
          }
          return { ...dl, state: newState, name: newName, mimeType: newMime } as RecentDownload;
        }
        return dl;
      }));
    };

    chrome.downloads.onCreated.addListener(handleDownloadCreated);
    chrome.downloads.onChanged.addListener(handleDownloadChanged);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.downloads.onCreated.removeListener(handleDownloadCreated);
      chrome.downloads.onChanged.removeListener(handleDownloadChanged);
    };
  }, [getFileName, handleTabChange]);

  useEffect(() => {
    chrome.storage.local.set({ workbar_images: images });
  }, [images]);

  // Persistent navigation update
  const navigateToProject = useCallback((id: string | null) => {
    setCurrentProjectId(id);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;

      // Update tab-specific mapping
      if (chrome.storage.session) {
        chrome.storage.session.get(['tab_mappings'], (res) => {
          const tabMappings = (res.tab_mappings || {}) as TabMappings;
          const tid = tab.id!.toString();
          chrome.storage.session.set({ tab_mappings: { ...tabMappings, [tid]: id } });
        });
      }

      const domain = getDomain(tab.url);
      if (domain) {
        chrome.storage.local.get(['site_mappings'], (res) => {
          const newMappings = { ...(res.site_mappings || {}), [domain]: id };
          chrome.storage.local.set({ site_mappings: newMappings });
        });
      }
    });
  }, [getDomain]);


  // Paste Support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => { if (ev.target?.result) addImage(ev.target.result as string, file.name); };
            reader.readAsDataURL(file);
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addImage]);

  // Navigation Path
  const breadcrumbs = useMemo(() => {
    const path = [];
    let curId = currentProjectId;
    while (curId) {
      const p = projects.find(x => x.id === curId);
      if (p) { path.unshift(p); curId = p.parentId; } else break;
    }
    return path;
  }, [currentProjectId, projects]);

  const fullPath = useMemo(() => [{ id: null, name: 'Root' }, ...breadcrumbs], [breadcrumbs]);

  // Filtered Content
  const currentSubProjects = projects
    .filter(p => p.parentId === currentProjectId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const currentImages = images.filter(img => img.projectId === currentProjectId);

  const currentVirtualFolders = virtualFolders
    .filter(vf => vf.projectId === currentProjectId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const currentRecentDownloads = recentDownloads.filter(dl => dl.projectId === currentProjectId);

  // Actions
  const openModal = useCallback((type: ModalState['type'], data?: Project | AppLink | VirtualFolder | StagedImage | RecentDownload | null) => {
    setModal({ type, data });
    if (type === 'app' && !data) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.url) {
          setFormData({ url: tab.url, name: tab.title || tab.url.replace(/^https?:\/\/(www\.)?/, '').split('.')[0], baseName: '' });
        }
      });
    } else {
      const d = data as { name?: string; url?: string; baseName?: string };
      setFormData({ name: d?.name || '', url: d?.url || '', baseName: d?.baseName || '' });
    }
  }, []);

  const closeModal = useCallback(() => setModal({ type: null }), []);

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { type, data } = modal;
    if (type === 'project') {
      const newProject: Project = { 
        id: crypto.randomUUID(), 
        name: formData.name, 
        parentId: currentProjectId,
        order: currentSubProjects.length
      };
      await saveProject(newProject);
      setProjects(prev => [...prev, newProject]);
    } 
    else if (type === 'app') {
      const url = formData.url.startsWith('http') ? formData.url : `https://${formData.url}`;
      const newApp: AppLink = { id: crypto.randomUUID(), name: formData.name, url, projectId: currentProjectId };
      await saveApp(newApp);
      setApps(prev => [...prev, newApp]);
    }
    else if (type === 'editApp') {
      const d = data as AppLink;
      const updated: AppLink = { ...d, name: formData.name, url: formData.url };
      await saveApp(updated);
      setApps(prev => prev.map(a => a.id === updated.id ? updated : a));
    }
    else if (type === 'virtualFolder') {
      try {
        const options: any = {};
        if (currentVirtualFolders.length > 0) {
          options.startIn = currentVirtualFolders[0].handle;
        }
        const handle = await (window as any).showDirectoryPicker(options);
        const newFolder: VirtualFolder = { 
          id: crypto.randomUUID(), 
          name: formData.name || handle.name, 
          baseName: formData.baseName || null, 
          handle, 
          projectId: currentProjectId,
          order: currentVirtualFolders.length 
        };
        await saveVirtualFolder(newFolder);
        setVirtualFolders(prev => [...prev, newFolder]);
      } catch (err) { if ((err as Error).name !== 'AbortError') console.error(err); }
    }
    else if (type === 'editVirtualFolder') {
      const d = data as VirtualFolder;
      const updated: VirtualFolder = { ...d, name: formData.name, baseName: formData.baseName || null };
      await saveVirtualFolder(updated);
      setVirtualFolders(prev => prev.map(f => f.id === updated.id ? updated : f));
    }
    else if (type === 'renameImage') {
      const d = data as StagedImage;
      setImages(prev => prev.map(img => img.id === d.id ? { ...img, name: formData.name } : img));
    }
    else if (type === 'renameDownload') {
      const d = data as RecentDownload;
      setRecentDownloads(prev => prev.map(dl => dl.id === d.id ? { ...dl, name: formData.name } : dl));
    }
    closeModal();
  };

  const removeProject = useCallback((id: string) => {
    if (!confirm('Delete folder? This will NOT delete contents, they will move up.')) return;
    deleteProject(id).then(() => {
      setProjects(prev => prev.filter(p => p.id !== id));
      const p = projects.find(x => x.id === id);
      const targetParent = p?.parentId || null;
      setProjects(prev => prev.map(x => x.parentId === id ? { ...x, parentId: targetParent } : x));
      setImages(prev => prev.map(x => x.projectId === id ? { ...x, projectId: targetParent } : x));
      setVirtualFolders(prev => prev.map(x => x.projectId === id ? { ...x, projectId: targetParent } : x));
      setApps(prev => prev.map(x => x.projectId === id ? { ...x, projectId: targetParent } : x));
    });
  }, [projects]);

  const removeVirtualFolder = useCallback((id: string) => {
    deleteVirtualFolder(id).then(() => setVirtualFolders(prev => prev.filter(f => f.id !== id)));
  }, []);

  const removeApp = useCallback((id: string) => {
    deleteApp(id).then(() => setApps(prev => prev.filter(a => a.id !== id)));
  }, []);

  const removeImage = useCallback((id: string) => setImages(prev => prev.filter(img => img.id !== id)), []);

  const verifyPermission = useCallback(async (handle: FileSystemDirectoryHandle, readWrite: boolean) => {
    const options: FileSystemHandlePermissionDescriptor = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if ((await handle.requestPermission(options)) === 'granted') return true;
    return false;
  }, []);

  const saveImageToFolder = useCallback(async (url: string, name: string, folder: VirtualFolder) => {
    try {
      if (!(await verifyPermission(folder.handle, true))) return;
      const response = await fetch(url);
      const blob = await response.blob();
      const ext = getExtensionFromMime(blob.type);
      
      const project = projects.find(p => p.id === folder.projectId);
      const projectNameStr = project ? project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
      const baseNameStr = folder.baseName ? folder.baseName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
      const originalNameStr = (name.replace(/\.[^/.]+$/, "") || 'image').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const timestampStr = Date.now().toString();

      const nameParts = [];
      if (projectNameStr) nameParts.push(projectNameStr);
      if (baseNameStr) nameParts.push(baseNameStr);
      
      // Only include original filename if it's not a generic placeholder
      const genericNames = ['image', 'downloading', 'web_image', 'dropped_image'];
      if (originalNameStr && !genericNames.some(gn => originalNameStr.includes(gn))) {
          nameParts.push(originalNameStr);
      }
      
      nameParts.push(timestampStr);

      const fileName = `${nameParts.join('_')}.${ext}`;
      
      const fileHandle = await folder.handle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) { console.error(err); alert('Failed to save to folder.'); }
  }, [verifyPermission, getExtensionFromMime, projects]);

  const convertToPng = useCallback(async (url: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failed'));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG conversion failed')), 'image/png');
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });
  }, []);

  const copyToClipboard = useCallback(async (url: string) => {
    try {
      const pngBlob = await convertToPng(url);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    } catch (err) { console.error('Copy failed:', err); }
  }, [convertToPng]);

  const handleMove = useCallback((type: string, id: string, targetProjectId: string | null) => {
    if (type === 'image') {
      setImages(prev => prev.map(img => img.id === id ? { ...img, projectId: targetProjectId } : img));
    } else if (type === 'project') {
      if (id === targetProjectId) return;
      setProjects(prev => {
        const updated = prev.map(p => p.id === id ? { ...p, parentId: targetProjectId } : p);
        const moved = updated.find(x => x.id === id);
        if (moved) saveProject(moved);
        return updated;
      });
    } else if (type === 'virtualFolder') {
      setVirtualFolders(prev => {
        const updated = prev.map(f => f.id === id ? { ...f, projectId: targetProjectId } : f);
        const moved = updated.find(x => x.id === id);
        if (moved) saveVirtualFolder(moved);
        return updated;
      });
    }
  }, []);

  const handleReorderDrop = useCallback(async (type: 'project' | 'virtualFolder', draggedId: string, targetId: string, position: 'left' | 'right') => {
    if (draggedId === targetId) return;

    if (type === 'project') {
      const items = projects.filter(p => p.parentId === currentProjectId).sort((a, b) => (a.order || 0) - (b.order || 0));
      const draggedIdx = items.findIndex(i => i.id === draggedId);
      if (draggedIdx === -1) return;
      
      const newItems = [...items];
      const [draggedItem] = newItems.splice(draggedIdx, 1);
      
      let targetIdx = newItems.findIndex(i => i.id === targetId);
      if (position === 'right') targetIdx += 1;
      
      newItems.splice(targetIdx, 0, draggedItem);
      
      const updated = newItems.map((item, idx) => ({ ...item, order: idx }));
      for (const item of updated) await saveProject(item);
      
      setProjects(prev => {
        const others = prev.filter(p => p.parentId !== currentProjectId);
        return [...others, ...updated];
      });
    } else {
      const items = virtualFolders.filter(f => f.projectId === currentProjectId).sort((a, b) => (a.order || 0) - (b.order || 0));
      const draggedIdx = items.findIndex(i => i.id === draggedId);
      if (draggedIdx === -1) return;

      const newItems = [...items];
      const [draggedItem] = newItems.splice(draggedIdx, 1);
      
      let targetIdx = newItems.findIndex(i => i.id === targetId);
      if (position === 'right') targetIdx += 1;
      
      newItems.splice(targetIdx, 0, draggedItem);
      
      const updated = newItems.map((item, idx) => ({ ...item, order: idx }));
      for (const item of updated) await saveVirtualFolder(item);
      
      setVirtualFolders(prev => {
        const others = prev.filter(f => f.projectId !== currentProjectId);
        return [...others, ...updated];
      });
    }
  }, [projects, virtualFolders, currentProjectId]);

  const FolderIcon = () => (
    <svg viewBox="190 1080 755 650" fill="currentColor">
      <g transform="matrix(0.13333333,0,0,-0.13333333,0,1954.6667)">
        <path d="M 6589.18,6069.05 H 4241.59 c -56.37,0 -111.4,17.21 -157.73,49.32 l -478.77,331.84 c -46.33,32.12 -101.35,49.32 -157.72,49.32 H 2075.75 c -152.92,0 -276.88,-123.96 -276.88,-276.87 V 5079.93 h 5067.19 v 712.25 c 0,152.91 -123.96,276.87 -276.88,276.87" fillOpacity="0.7"/>
        <path d="M 6663.59,1760 H 2001.34 c -180.38,0 -329.58,140.4 -340.47,320.5 L 1490.8,4892.47 c -11.86,196.12 143.99,361.68 340.47,361.68 h 5002.39 c 196.48,0 352.33,-165.56 340.47,-361.68 L 7004.06,2080.5 C 6993.17,1900.4 6843.98,1760 6663.59,1760" />
      </g>
    </svg>
  );

  const CogIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
    </svg>
  );

  const PenIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  );

  return (
    <div className={`app-container ${isDragging ? 'dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setIsDragging(false);
        const internalMove = e.dataTransfer.getData('workbar-move');
        if (internalMove) { handleMove(JSON.parse(internalMove).type, JSON.parse(internalMove).id, currentProjectId); return; }
        const files = e.dataTransfer.files;
        if (files.length > 0) Array.from(files).forEach(file => {
          const reader = new FileReader();
          reader.onload = (ev) => { if (ev.target?.result) addImage(ev.target.result as string, file.name); };
          reader.readAsDataURL(file);
        }); else {
          const html = e.dataTransfer.getData('text/html');
          if (html) { const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img'); if (img?.src) addImage(img.src, 'dropped-image'); }
        }
      }}
    >
      <header>
        <div className="header-top">
          <h1>Workbar</h1>
          <div className="header-actions">
            {!isAppsMode && <button className="add-btn" onClick={() => openModal('project')}>+ Folder</button>}
            {!isAppsMode ? <button className="add-btn apps-mode-btn" onClick={() => setIsAppsMode(true)}>Apps</button> : <button className="add-btn back-btn" onClick={() => setIsAppsMode(false)}>&times;</button>}
          </div>
        </div>
        <nav className="breadcrumbs">
           <span className={`crumb ${!currentProjectId ? 'active' : ''}`} onClick={() => navigateToProject(null)}
             onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
             onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
             onDrop={(e) => {
               e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over');
               const moveData = e.dataTransfer.getData('workbar-move');
               if (moveData) { const { type, id } = JSON.parse(moveData); handleMove(type, id, null); }
             }}
           >Root</span>
           {breadcrumbs.map(p => (
             <span key={p.id} className={`crumb ${p.id === currentProjectId ? 'active' : ''}`} onClick={() => navigateToProject(p.id)}
               onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
               onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
               onDrop={(e) => {
                 e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over');
                 const moveData = e.dataTransfer.getData('workbar-move');
                 if (moveData) { const { type, id } = JSON.parse(moveData); handleMove(type, id, p.id); }
               }}
             >/ {p.name}</span>
           ))}
        </nav>
      </header>

      <main className="grid-container">
        {isAppsMode ? (
          <div className="apps-container">
            {fullPath.map((node) => {
              const nodeApps = apps.filter(a => a.projectId === node.id);
              return (
                <section key={node.id || 'root'} className="app-hierarchy-section">
                  <h3>{node.name} Apps</h3>
                  <div className="apps-grid">
                    {nodeApps.map(app => (
                      <div key={app.id} className="app-card" onClick={() => window.open(app.url, '_blank')}>
                        <div className="app-icon"><img src={`https://www.google.com/s2/favicons?domain=${app.url}&sz=64`} alt={app.name} /></div>
                        <span className="app-name">{app.name}</span>
                        <button className="settings-btn" onClick={(e) => { e.stopPropagation(); openModal('editApp', app); }}><CogIcon /></button>
                        <button className="delete-app" onClick={(e) => { e.stopPropagation(); removeApp(app.id); }}>&times;</button>
                      </div>
                    ))}
                    {node.id === currentProjectId && <div className="app-card add-app-card" onClick={() => openModal('app')}><div className="app-icon">+</div><span className="app-name">Add App</span></div>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <>
            {currentRecentDownloads.length > 0 && (
              <section className="recent-downloads-section">
                <div className="section-header"><h2>Recent Downloads</h2><button className="clear-btn" onClick={() => setRecentDownloads(prev => prev.filter(dl => dl.projectId !== currentProjectId))}>Clear</button></div>
                <div className="recent-grid">
                  {currentRecentDownloads.map(dl => (
                    <div key={dl.id} className="image-card recent">
                      <img src={dl.url} alt={dl.name} draggable onDragStart={(e) => {
                        chrome.runtime.sendMessage({ type: 'store-drag-data', dataUrl: dl.url, dragId: `recent-${dl.id}` });
                        e.dataTransfer.setData('application/x-workbar-image', JSON.stringify({ dragId: `recent-${dl.id}`, name: dl.name, mimeType: dl.mimeType }));
                        e.dataTransfer.setData('workbar-image-id', `recent-${dl.id}`);
                      }} />
                      <button onClick={() => setRecentDownloads(prev => prev.filter(item => item.id !== dl.id))} className="delete-btn top-right">&times;</button>
                      <button className="rename-btn top-left" onClick={() => openModal('renameDownload', dl)} title="Rename Image"><PenIcon /></button>
                      <div className="image-actions"><button onClick={() => copyToClipboard(dl.url)}>Copy PNG</button><button onClick={() => addImage(dl.url, dl.name)}>Stage</button></div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="image-grid">
              {currentSubProjects.map((p) => (
                <div key={p.id} 
                  className={`item-card project-folder 
                    ${dropIndicator?.id === p.id && dropIndicator.type === 'project' ? `drop-${dropIndicator.position}` : ''}`} 
                  onClick={() => navigateToProject(p.id)} 
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('workbar-move', JSON.stringify({ type: 'project', id: p.id, action: 'reorder' }));
                    e.dataTransfer.setData('application/x-workbar-reorder', 'project');
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.types.includes('application/x-workbar-reorder')) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relX = e.clientX - rect.left;
                      const position = relX < rect.width / 2 ? 'left' : 'right';
                      setDropIndicator({ id: p.id, type: 'project', position });
                      e.currentTarget.classList.remove('drag-over');
                    } else {
                      setDropIndicator(null);
                      e.currentTarget.classList.add('drag-over');
                    }
                  }}
                  onDragLeave={(e) => {
                    setDropIndicator(null);
                    e.currentTarget.classList.remove('drag-over');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.remove('drag-over');
                    const moveData = e.dataTransfer.getData('workbar-move');
                    if (moveData) {
                      const { type, id, action } = JSON.parse(moveData);
                      if (action === 'reorder' && type === 'project' && e.dataTransfer.types.includes('application/x-workbar-reorder')) {
                        handleReorderDrop('project', id, p.id, dropIndicator?.position || 'left');
                      } else {
                        handleMove(type, id, p.id);
                      }
                    }
                    setDropIndicator(null);
                  }}
                >
                  <div className="folder-icon project"><FolderIcon /></div>
                  <span className="item-name">{p.name}</span>
                  <div className="item-actions">
                    <button className="delete-item" onClick={(e) => { e.stopPropagation(); removeProject(p.id); }}>&times;</button>
                  </div>
                </div>
              ))}

              {currentVirtualFolders.map((vf) => (
                <div key={vf.id} 
                  className={`item-card virtual-folder 
                    ${dropIndicator?.id === vf.id && dropIndicator.type === 'virtualFolder' ? `drop-${dropIndicator.position}` : ''}`} 
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('workbar-move', JSON.stringify({ type: 'virtualFolder', id: vf.id, action: 'reorder' }));
                    e.dataTransfer.setData('application/x-workbar-reorder', 'virtualFolder');
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.types.includes('application/x-workbar-reorder')) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relX = e.clientX - rect.left;
                      const position = relX < rect.width / 2 ? 'left' : 'right';
                      setDropIndicator({ id: vf.id, type: 'virtualFolder', position });
                      e.currentTarget.classList.remove('drag-over');
                    } else {
                      setDropIndicator(null);
                      e.currentTarget.classList.add('drag-over');
                    }
                  }}
                  onDragLeave={(e) => {
                    setDropIndicator(null);
                    e.currentTarget.classList.remove('drag-over');
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.remove('drag-over');
                    setDropIndicator(null);
                    
                    const isReorder = e.dataTransfer.types.includes('application/x-workbar-reorder');
                    const moveData = e.dataTransfer.getData('workbar-move');
                    
                    if (isReorder && moveData) {
                      const { type, id, action } = JSON.parse(moveData);
                      if (action === 'reorder' && type === 'virtualFolder') {
                        handleReorderDrop('virtualFolder', id, vf.id, dropIndicator?.position || 'left');
                        return;
                      }
                    }

                    const internalId = e.dataTransfer.getData('workbar-image-id');
                    if (internalId) {
                      let sourceImg;
                      if (internalId.startsWith('recent-')) {
                         const rid = parseInt(internalId.replace('recent-', ''));
                         const dl = recentDownloads.find(x => x.id === rid);
                         if (dl) sourceImg = { url: dl.url, name: dl.name };
                      } else { sourceImg = images.find(x => x.id === internalId); }
                      if (sourceImg) await saveImageToFolder(sourceImg.url, sourceImg.name, vf);
                      return;
                    }
                    const files = e.dataTransfer.files;
                    if (files.length > 0) {
                      for (const file of Array.from(files)) if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = async (ev) => { if (ev.target?.result) await saveImageToFolder(ev.target.result as string, file.name, vf); };
                        reader.readAsDataURL(file);
                      }
                    } else {
                      const html = e.dataTransfer.getData('text/html');
                      if (html) { const img = new DOMParser().parseFromString(html, 'text/html').querySelector('img'); if (img?.src) await saveImageToFolder(img.src, 'web-image', vf); }
                      else { const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('url'); if (url) await saveImageToFolder(url, 'web-image', vf); }
                    }
                  }}
                >
                  <div className="folder-icon virtual"><FolderIcon /></div>
                  <span className="item-name">{vf.name}</span>
                  <div className="item-actions">
                    <button className="settings-btn" onClick={(e) => { e.stopPropagation(); openModal('editVirtualFolder', vf); }}><CogIcon /></button>
                    <button className="delete-item" onClick={() => removeVirtualFolder(vf.id)}>&times;</button>
                  </div>
                </div>
              ))}

              <div className="item-card placeholder dotted" onClick={() => openModal('virtualFolder')}><div className="folder-icon">+</div><span className="item-name">Map Desktop Folder</span></div>

              {currentImages.map(image => (
                <div key={image.id} className="image-card" draggable 
                  onDragStart={(e) => {
                    const cacheKey = `staged-${image.id}`;
                    chrome.runtime.sendMessage({ type: 'store-drag-data', dataUrl: image.url, dragId: cacheKey });
                    e.dataTransfer.setData('application/x-workbar-image', JSON.stringify({ dragId: cacheKey, name: image.name, mimeType: image.mimeType }));
                    e.dataTransfer.setData('workbar-move', JSON.stringify({ type: 'image', id: image.id }));
                    e.dataTransfer.setData('workbar-image-id', image.id);
                  }}
                >
                  <img src={image.url} alt={image.name} />
                  <button onClick={() => removeImage(image.id)} className="delete-btn top-right">&times;</button>
                  <button className="rename-btn top-left" onClick={() => openModal('renameImage', image)} title="Rename Image"><PenIcon /></button>
                  <div className="image-actions"><button onClick={() => copyToClipboard(image.url)}>Copy PNG</button></div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {modal.type && (
        <div className="modal-overlay">
          <div className="modal-container">
            <h2>
              {modal.type === 'project' && 'Create New Folder'}
              {modal.type === 'app' && 'Add New App'}
              {modal.type === 'editApp' && 'App Settings'}
              {modal.type === 'virtualFolder' && 'Map Desktop Folder'}
              {modal.type === 'editVirtualFolder' && 'Folder Settings'}
              {modal.type === 'renameImage' && 'Rename Image'}
              {modal.type === 'renameDownload' && 'Rename Download'}
            </h2>
            <form className="modal-form" onSubmit={handleModalSubmit}>
              <div className="form-group">
                <label>Nickname / Display Name</label>
                <input autoFocus type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. My Assets" required={modal.type !== 'virtualFolder'} />
              </div>
              {(modal.type === 'app' || modal.type === 'editApp') && (
                <div className="form-group">
                  <label>URL</label>
                  <input type="text" value={formData.url} onChange={e => setFormData({...formData, url: e.target.value})} placeholder="google.com" required />
                </div>
              )}
              {(modal.type === 'virtualFolder' || modal.type === 'editVirtualFolder') && (
                <div className="form-group">
                  <label>Base Name (Naming Rule)</label>
                  <input type="text" value={formData.baseName} onChange={e => setFormData({...formData, baseName: e.target.value})} placeholder="e.g. portrait (empty for original name)" />
                  <small style={{fontSize: '0.65rem', color: 'var(--text-muted)'}}>Files will save as: <code>[BaseName]-[Timestamp].[ext]</code></small>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="add-btn">{modal.type === 'editVirtualFolder' ? 'Save' : (modal.type === 'virtualFolder' ? 'Select Folder' : 'Create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
