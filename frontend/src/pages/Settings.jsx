
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, booksApi, usersApi } from '../api/api';
import { 
    FolderPlus, 
    Trash2, 
    Folder, 
    FolderSearch, 
    ChevronRight, 
    ChevronUp, 
    Loader, 
    X, 
    Upload, 
    FileText, 
    BookOpen,
    CheckCircle2, 
    AlertCircle,
    Server,
    Laptop,
    Type,
    Palette,
    Volume2,
    CloudOff,
    RefreshCw,
    Download
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useAuth } from '../context/AuthContext';
import {
    clearOfflineBooks,
    clearOfflineFolderMeta,
    ensureOfflineFolderPermission,
    getOfflineBooks,
    getOfflineFolderMeta,
    saveOfflineBooks,
    saveOfflineFolder,
    writeOfflineBookToFolder
} from '../lib/offline';

const OPENAI_TTS_VOICES = [
  { id: 'marin', label: 'Marin', hint: 'Best quality' },
  { id: 'cedar', label: 'Cedar', hint: 'Best quality' },
  { id: 'alloy', label: 'Alloy', hint: 'Balanced' },
  { id: 'ash', label: 'Ash', hint: 'Calm' },
  { id: 'ballad', label: 'Ballad', hint: 'Expressive' },
  { id: 'coral', label: 'Coral', hint: 'Warm' },
  { id: 'echo', label: 'Echo', hint: 'Clear' },
  { id: 'fable', label: 'Fable', hint: 'Story-like' },
  { id: 'onyx', label: 'Onyx', hint: 'Deep' },
  { id: 'nova', label: 'Nova', hint: 'Bright' },
  { id: 'sage', label: 'Sage', hint: 'Measured' },
  { id: 'shimmer', label: 'Shimmer', hint: 'Soft' },
  { id: 'verse', label: 'Verse', hint: 'Natural' }
];

const BrowserModal = ({ isOpen, onClose, onSelect }) => {
    const [currentPath, setCurrentPath] = useState('');
    const [folders, setFolders] = useState([]);
    const [parentPath, setParentPath] = useState('');
    const [loading, setLoading] = useState(false);
    
    const loadPath = async (path = '') => {
        setLoading(true);
        try {
            const res = await settingsApi.browseFilesystem(path);
            setCurrentPath(res.data.path);
            setFolders(res.data.folders);
            setParentPath(res.data.parent);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) loadPath();
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-card w-full max-w-2xl rounded-xl border border-border shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/20">
                    <h3 className="font-bold flex items-center gap-2">
                        <FolderSearch size={18} />
                        Browse Server Folders
                    </h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-2 border-b border-border bg-muted/30 font-mono text-xs overflow-x-auto whitespace-nowrap">
                    {currentPath || 'Loading...'}
                </div>

                <div className="flex-1 overflow-y-auto p-2 min-h-[300px]">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                            <Loader className="animate-spin" size={20} /> Loading...
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                             <div 
                                onClick={() => loadPath(parentPath)}
                                className={cn("flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted/50 text-muted-foreground", !parentPath && "opacity-50 pointer-events-none")}
                             >
                                <ChevronUp size={16} />
                                <span className="text-sm font-bold">.. (Up One Level)</span>
                             </div>
                             
                             {folders.map(folder => (
                                 <div 
                                    key={folder}
                                    onClick={() => loadPath(currentPath + (currentPath.endsWith('/') ? '' : '/') + folder)}
                                    className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors group"
                                 >
                                    <Folder size={16} className="text-muted-foreground group-hover:text-primary fill-current/20" />
                                    <span className="text-sm">{folder}</span>
                                    <ChevronRight size={14} className="ml-auto opacity-0 group-hover:opacity-100" />
                                 </div>
                             ))}
                             
                             {folders.length === 0 && (
                                <div className="text-center py-10 text-muted-foreground text-sm italic">
                                    No subfolders found.
                                </div>
                             )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-secondary/20 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm hover:underline">Cancel</button>
                    <button 
                        onClick={() => { onSelect(currentPath); onClose(); }} 
                        className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-bold hover:scale-105 transition-transform"
                    >
                        Select This Folder
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function Settings() {
  const { user, checkAuth } = useAuth();
  const navigate = useNavigate();
  const isLibrarian = !!user?.userrole_managebooks;
  const [activeTab, setActiveTab] = useState(isLibrarian ? 'server' : 'reader');
  const [directories, setDirectories] = useState([]);
  const [newPath, setNewPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  // Local Bulk Upload States
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Reader Preferences States
  const [fontFamily, setFontFamily] = useState(user?.user_font_family || 'sans');
  const [fontSize, setFontSize] = useState(user?.user_font_size || 18);
  const [theme, setTheme] = useState(user?.user_theme || 'light');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // TTS Preferences States
  const [voices, setVoices] = useState([]);
  const [ttsVoices, setTtsVoices] = useState({
    en: localStorage.getItem('tts_voice_en') || '',
    it: localStorage.getItem('tts_voice_it') || '',
    fr: localStorage.getItem('tts_voice_fr') || '',
    es: localStorage.getItem('tts_voice_es') || '',
  });
  const [openAITtsEnabled, setOpenAITtsEnabled] = useState(localStorage.getItem('openai_tts_enabled') === 'true');
  const [openAITtsVoice, setOpenAITtsVoice] = useState(localStorage.getItem('openai_tts_voice') || 'marin');

  // Offline library states
  const [offlineBooks, setOfflineBooks] = useState([]);
  const [offlineFolderMeta, setOfflineFolderMeta] = useState(null);
  const [offlineFolderHandle, setOfflineFolderHandle] = useState(null);
  const [offlineCatalog, setOfflineCatalog] = useState([]);
  const [isOfflineDownloading, setIsOfflineDownloading] = useState(false);
  const [offlineDownloadCount, setOfflineDownloadCount] = useState(0);
  const [offlineMessage, setOfflineMessage] = useState('');

  useEffect(() => {
    const updateVoices = () => {
        setVoices(window.speechSynthesis.getVoices());
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  const handleVoiceChange = (lang, voiceURI) => {
    setTtsVoices(prev => ({ ...prev, [lang]: voiceURI }));
    localStorage.setItem(`tts_voice_${lang}`, voiceURI);
  };

  const handleOpenAITtsEnabledChange = (enabled) => {
    setOpenAITtsEnabled(enabled);
    localStorage.setItem('openai_tts_enabled', enabled ? 'true' : 'false');
  };

  const handleOpenAIVoiceChange = (voice) => {
    setOpenAITtsVoice(voice);
    localStorage.setItem('openai_tts_voice', voice);
  };

  const refreshOfflineState = async (userId = user?.id) => {
    if (!userId) return;
    try {
        const [books, folderMeta] = await Promise.all([
            getOfflineBooks(userId),
            getOfflineFolderMeta(userId)
        ]);
        setOfflineBooks(books);
        setOfflineFolderMeta(folderMeta);
        setOfflineFolderHandle(folderMeta?.folderHandle || null);
        if (navigator.onLine) {
            const catalogResponse = await booksApi.getOfflineCatalog();
            setOfflineCatalog(catalogResponse.data.data || []);
        }
    } catch (err) {
        setOfflineMessage(err.message || 'Offline storage is unavailable in this browser.');
    }
  };

  const handleOfflineFolderPick = async () => {
    if (!window.showDirectoryPicker) {
        setOfflineMessage('Downloading to a selected folder requires a Chromium-based browser over HTTPS.');
        return;
    }

    try {
        const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const permissionGranted = await ensureOfflineFolderPermission(directoryHandle, true);
        if (!permissionGranted) {
            setOfflineMessage('Bookshelf needs write permission for the selected folder.');
            return;
        }
        await saveOfflineFolder(user.id, directoryHandle);
        setOfflineFolderHandle(directoryHandle);
        await refreshOfflineState(user.id);
        setOfflineMessage(`Offline folder ready: ${directoryHandle.name}.`);
    } catch (err) {
        if (err.name !== 'AbortError') setOfflineMessage(err.message || 'Could not select the offline folder.');
    }
  };

  const handleDownloadOfflineBooks = async () => {
    if (!offlineFolderHandle) {
        setOfflineMessage('Choose an offline folder first.');
        return;
    }
    if (!offlineCatalog.length) {
        setOfflineMessage('No EPUB books are available to download.');
        return;
    }

    setIsOfflineDownloading(true);
    setOfflineDownloadCount(0);
    setOfflineMessage(`Downloading 0 of ${offlineCatalog.length} EPUBs...`);
    try {
        const permissionGranted = await ensureOfflineFolderPermission(offlineFolderHandle, true);
        if (!permissionGranted) throw new Error('Bookshelf needs write permission for the selected folder.');

        let completedCount = 0;
        for (const catalogBook of offlineCatalog) {
            const response = await booksApi.downloadFile(catalogBook.ID);
            const fileHandle = await writeOfflineBookToFolder(offlineFolderHandle, catalogBook.book_filename, response.data);
            await saveOfflineBooks(user.id, [{
                bookId: catalogBook.ID,
                filename: catalogBook.book_filename,
                fileHandle,
                metadata: catalogBook
            }]);
            completedCount += 1;
            setOfflineDownloadCount(completedCount);
            setOfflineMessage(`Downloading ${completedCount} of ${offlineCatalog.length} EPUBs...`);
        }

        await refreshOfflineState(user.id);
        setOfflineMessage(`Downloaded ${offlineCatalog.length} EPUBs to ${offlineFolderHandle.name}.`);
    } catch (err) {
        console.error('Offline book download failed', err);
        setOfflineMessage(err.response?.data?.error || err.message || 'Could not download the offline books.');
    } finally {
        setIsOfflineDownloading(false);
    }
  };

  const handleClearOfflineBooks = async () => {
    try {
        await clearOfflineBooks(user.id);
        await clearOfflineFolderMeta(user.id);
        setOfflineBooks([]);
        setOfflineFolderMeta(null);
        setOfflineMessage('Bookshelf removed the offline metadata. Files already written to the folder were left untouched.');
    } catch (err) {
        setOfflineMessage(err.message || 'Could not clear offline EPUB copies.');
    }
  };

  const fetchDirectories = async () => {
    try {
      const res = await settingsApi.getDirectories();
      setDirectories(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
        setFontFamily(user.user_font_family || 'sans');
        setFontSize(user.user_font_size || 18);
        setTheme(user.user_theme || 'light');
        refreshOfflineState(user.id);
    }
  }, [user]);

  useEffect(() => {
    if (isLibrarian && activeTab === 'server') {
        fetchDirectories();
    }
  }, [isLibrarian, activeTab]);

  const handleSavePreferences = async () => {
        setIsSaving(true);
        setSaveMessage('');
        try {
            await usersApi.update(user.id, {
                user_username: user.username,
                user_email: user.email,
                user_font_family: fontFamily,
                user_font_size: fontSize,
                user_theme: theme,
            });
            await checkAuth();
            setSaveMessage('Preferences saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error(err);
            setSaveMessage('Failed to save preferences.');
        } finally {
            setIsSaving(false);
        }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newPath) return;
    try {
      await settingsApi.addDirectory(newPath);
      setNewPath('');
      fetchDirectories();
      setError('');
    } catch (err) {
       setError(err.response?.data?.error || 'Failed to add directory');
    }
  };

  const handleDelete = async (id) => {
    try {
      await settingsApi.deleteDirectory(id);
      setDirectories(prev => prev.filter(d => d.ID !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(f => {
        const lowerName = f.name.toLowerCase();
        return lowerName.endsWith('.epub') || 
               lowerName.endsWith('.pdf') ||
               lowerName.endsWith('.cbz') || 
               lowerName.endsWith('.cbr') ||
               lowerName.endsWith('.zip') || 
               lowerName.endsWith('.rar');
    }).map(f => ({
        file: f,
        id: Math.random().toString(36).substr(2, 9),
        status: 'pending', // pending, uploading, success, error
        progress: 0,
        error: null
    }));

    setSelectedFiles(validFiles);
  };

  const uploadFile = async (fileObj) => {
    const formData = new FormData();
    formData.append('book', fileObj.file);

    try {
        setSelectedFiles(prev => prev.map(f => 
            f.id === fileObj.id ? { ...f, status: 'uploading' } : f
        ));

        await booksApi.upload(formData, {
            onUploadProgress: (progressEvent) => {
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setSelectedFiles(prev => prev.map(f => 
                    f.id === fileObj.id ? { ...f, progress } : f
                ));
            }
        });

        setSelectedFiles(prev => prev.map(f => 
            f.id === fileObj.id ? { ...f, status: 'success', progress: 100 } : f
        ));
    } catch (err) {
        setSelectedFiles(prev => prev.map(f => 
            f.id === fileObj.id ? { ...f, status: 'error', error: err.message } : f
        ));
    }
  };

  const handleBulkUpload = async () => {
    if (isUploading) return;
    setIsUploading(true);

    // Filter only pending or error files for upload
    const toUpload = selectedFiles.filter(f => f.status === 'pending' || f.status === 'error');
    
    // Process in batches of 3 to avoid overwhelming the server
    const batchSize = 3;
    for (let i = 0; i < toUpload.length; i += batchSize) {
        const batch = toUpload.slice(i, i + batchSize);
        await Promise.all(batch.map(f => uploadFile(f)));
    }

    setIsUploading(false);
  };



  return (
    <div className="flex-1 overflow-y-auto bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-black tracking-tight mb-8">Settings</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-secondary/20 p-1 rounded-xl w-fit">
            <button 
                onClick={() => setActiveTab('reader')}
                className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    activeTab === 'reader' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
            >
                <Palette size={16} />
                Reader Preferences
            </button>

            <button
                onClick={() => setActiveTab('offline')}
                className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    activeTab === 'offline' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
            >
                <CloudOff size={16} />
                Offline Library
                {offlineBooks.length > 0 && (
                    <span className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                        {offlineBooks.length}
                    </span>
                )}
            </button>
            
            {isLibrarian && (
                <>
                    <button 
                        onClick={() => setActiveTab('server')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'server' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Server size={16} />
                        Server Libraries
                    </button>
                    <button 
                        onClick={() => setActiveTab('local')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'local' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Laptop size={16} />
                        Local Bulk Upload
                    </button>
                </>
            )}
        </div>

        {activeTab === 'reader' && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-6 border-b border-border bg-muted/20">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Type className="text-primary" />
                        Type & Theme Settings
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Customize your default reading experience. These settings will apply to all your books.
                    </p>
                </div>
                
                <div className="p-6 max-w-2xl">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Font Family</label>
                            <div className="flex flex-wrap gap-2">
                                {['sans', 'serif', 'mono'].map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => setFontFamily(f)}
                                        className={cn(
                                            "px-4 py-2 rounded-lg border transition-all capitalize flex-1 md:flex-none",
                                            fontFamily === f ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/10 border-border hover:border-primary/50"
                                        )}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold">Font Size ({fontSize}px)</label>
                            <div className="flex items-center gap-4">
                                <input 
                                    type="range" 
                                    min="12" 
                                    max="32" 
                                    step="1" 
                                    value={fontSize} 
                                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                                    className="flex-1 accent-primary h-2 bg-secondary/30 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="font-mono bg-secondary/20 px-3 py-1 rounded text-sm w-12 text-center">{fontSize}</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold">Theme</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { id: 'light', label: 'Light', bg: 'bg-white', text: 'text-black' },
                                    { id: 'dark', label: 'Dark', bg: 'bg-zinc-900', text: 'text-white' },
                                    { id: 'sepia', label: 'Sepia', bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]' }
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id)}
                                        className={cn(
                                            "px-4 py-3 rounded-lg border transition-all flex items-center gap-2 flex-1 md:flex-none",
                                            theme === t.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:border-primary/50",
                                            t.bg, t.text
                                        )}
                                    >
                                        {theme === t.id && <CheckCircle2 size={16} />}
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-border">
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                <Volume2 size={16} /> Text-to-Speech Voices
                            </h3>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground">Read Aloud Engine</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleOpenAITtsEnabledChange(false)}
                                        className={cn(
                                            "px-3 py-2 rounded-lg border text-sm font-bold transition-all",
                                            !openAITtsEnabled ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/10 border-border hover:border-primary/50"
                                        )}
                                    >
                                        Browser
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenAITtsEnabledChange(true)}
                                        className={cn(
                                            "px-3 py-2 rounded-lg border text-sm font-bold transition-all",
                                            openAITtsEnabled ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/10 border-border hover:border-primary/50"
                                        )}
                                    >
                                        AI MP3
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground">AI Narration Voice</label>
                                <select
                                    value={openAITtsVoice}
                                    onChange={(e) => handleOpenAIVoiceChange(e.target.value)}
                                    disabled={!openAITtsEnabled}
                                    className="w-full bg-secondary/30 border border-input rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                >
                                    {OPENAI_TTS_VOICES.map((voice) => (
                                        <option key={voice.id} value={voice.id}>
                                            {voice.label} - {voice.hint}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[{ id: 'en', label: 'English' }, { id: 'it', label: 'Italian' }, { id: 'fr', label: 'French' }, { id: 'es', label: 'Spanish' }].map(lang => {
                                    const langVoices = voices.filter(v => v.lang.toLowerCase().startsWith(lang.id));
                                    return (
                                        <div key={lang.id} className="space-y-1">
                                            <label className="text-xs font-bold text-muted-foreground">{lang.label} Voice</label>
                                            <select 
                                                value={ttsVoices[lang.id]}
                                                onChange={(e) => handleVoiceChange(lang.id, e.target.value)}
                                                className="w-full bg-secondary/30 border border-input rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                            >
                                                <option value="">Default System Voice</option>
                                                {langVoices.map(v => (
                                                    <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border flex items-center gap-4">
                            <button 
                                onClick={handleSavePreferences}
                                disabled={isSaving}
                                className="bg-primary text-primary-foreground font-black px-8 py-2.5 rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:scale-100"
                            >
                                {isSaving ? <Loader className="animate-spin" size={20} /> : 'Save Preferences'}
                            </button>
                            {saveMessage && (
                                <span className={cn("text-sm font-bold animate-in fade-in", saveMessage.includes('Failed') ? "text-destructive" : "text-green-500")}>
                                    {saveMessage}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'offline' && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-6 border-b border-border bg-muted/20">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <CloudOff className="text-primary" />
                                Offline Library
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Download EPUBs to a folder on your device and keep reading with your saved metadata and progress when you are offline.
                            </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                            {offlineBooks.length} ready
                        </span>
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleOfflineFolderPick}
                                    disabled={isOfflineDownloading}
                                    className="bg-primary text-primary-foreground font-black px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-60"
                                >
                                    <FolderSearch size={17} />
                                    {offlineFolderHandle ? 'Change Offline Folder' : 'Choose Offline Folder'}
                                </button>
                            </div>

                            {offlineFolderMeta?.name && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/10 border border-border rounded-lg px-3 py-2">
                                    <Folder size={14} className="text-primary shrink-0" />
                                    <span className="truncate">{offlineFolderMeta.name}</span>
                                    <span className="ml-auto shrink-0">{offlineBooks.length} EPUBs ready</span>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                {offlineFolderHandle && (
                                    <button
                                        type="button"
                                        onClick={handleDownloadOfflineBooks}
                                        disabled={isOfflineDownloading || !offlineCatalog.length}
                                        className="bg-foreground text-background font-black px-5 py-2.5 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isOfflineDownloading ? <Loader className="animate-spin" size={17} /> : <Download size={17} />}
                                        {isOfflineDownloading ? `Downloading ${offlineDownloadCount}/${offlineCatalog.length}` : `Download ${offlineCatalog.length} EPUBs`}
                                    </button>
                                )}
                                {offlineBooks.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClearOfflineBooks}
                                        disabled={isOfflineDownloading}
                                        className="text-xs font-bold text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center gap-2 px-3 py-2"
                                    >
                                        <Trash2 size={15} /> Remove offline metadata
                                    </button>
                                )}
                            </div>
                        </div>

                        {offlineMessage && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                                {isOfflineDownloading && <RefreshCw size={14} className="animate-spin text-primary" />}
                                <span>{offlineMessage}</span>
                            </div>
                        )}
                    </div>

                    <div className="pt-6 border-t border-border">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                                <h3 className="text-lg font-bold">Books available offline</h3>
                                <p className="text-sm text-muted-foreground mt-1">These EPUBs are ready to open without a connection.</p>
                            </div>
                            <span className="text-sm font-bold text-muted-foreground">{offlineBooks.length}</span>
                        </div>

                        {offlineBooks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-12 px-6 bg-secondary/10 border border-dashed border-border rounded-xl">
                                <BookOpen size={36} className="text-muted-foreground mb-3" />
                                <p className="font-bold">No books available offline</p>
                                <p className="text-sm text-muted-foreground mt-1">Choose a folder and download your EPUB library to see it here.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {offlineBooks.map((offlineBook) => {
                                    const book = offlineBook.metadata || {};
                                    const title = book.book_title || offlineBook.filename || 'Untitled book';
                                    const progress = Math.min(100, Math.max(0, Number(book.book_progress_percentage) || 0));
                                    const year = book.book_date ? new Date(book.book_date).getFullYear() : 'N/A';

                                    return (
                                        <div key={offlineBook.bookId} className="flex items-center gap-3 p-3 bg-secondary/10 border border-border rounded-xl min-w-0">
                                            <div className="w-12 aspect-[2/3] rounded-md overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                                                {book.book_cover_img ? (
                                                    <img
                                                        src={`${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}`}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <BookOpen size={20} className="text-primary" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold truncate" title={title}>{title}</h4>
                                                <p className="text-xs text-muted-foreground truncate mt-0.5" title={offlineBook.filename}>
                                                    {book.format_name || 'EPUB'} · {year}
                                                </p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="h-1.5 flex-1 bg-background/60 rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-muted-foreground shrink-0">{progress}%</span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/reader/${offlineBook.bookId}`)}
                                                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors shrink-0"
                                                title="Read offline"
                                                aria-label={`Read ${title}`}
                                            >
                                                <BookOpen size={17} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'server' && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-6 border-b border-border bg-muted/20">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Folder className="text-primary" />
                        Library Import Folders
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Books found in these folders will be automatically imported into the library during a scan.
                    </p>
                </div>
                
                <div className="p-6">
                    <form onSubmit={handleAdd} className="flex gap-4 mb-8">
                        <div className="flex-1 flex gap-2">
                            <input 
                                type="text" 
                                value={newPath}
                                onChange={(e) => setNewPath(e.target.value)}
                                placeholder="/path/to/your/books"
                                className="flex-1 bg-secondary/30 border border-input rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowBrowser(true)}
                                className="bg-secondary text-foreground p-2.5 rounded-xl hover:bg-white/10 transition-colors border border-input shadow-sm"
                                title="Browse Server Folders"
                            >
                                <FolderSearch size={20} />
                            </button>
                        </div>
                        <button 
                            type="submit"
                            className="bg-primary text-primary-foreground font-black px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95"
                        >
                            <FolderPlus size={18} />
                            Add Folder
                        </button>
                    </form>

                    <BrowserModal 
                        isOpen={showBrowser} 
                        onClose={() => setShowBrowser(false)} 
                        onSelect={(path) => setNewPath(path)} 
                    />

                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-xl mb-4 border border-destructive/20 flex items-center gap-2">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-3">
                        {loading ? (
                            <div className="flex items-center gap-2 text-muted-foreground italic p-4">
                                <Loader className="animate-spin" size={16} />
                                Loading directories...
                            </div>
                        ) : directories.length === 0 ? (
                            <div className="text-center py-12 bg-secondary/10 rounded-2xl text-muted-foreground border-2 border-dashed border-border">
                                <Folder size={40} className="mx-auto mb-3 opacity-20" />
                                <p className="font-bold">No import folders configured.</p>
                                <p className="text-xs mt-1">Add folders on the server to start scanning for books.</p>
                            </div>
                        ) : (
                            directories.map(dir => (
                                <div key={dir.ID} className="flex items-center justify-between p-4 bg-secondary/5 border border-border rounded-xl group hover:bg-secondary/10 hover:border-primary/30 transition-all duration-200">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="bg-primary/10 p-2 rounded-lg">
                                            <Folder size={18} className="text-primary" />
                                        </div>
                                        <span className="font-mono text-sm truncate text-foreground/80">{dir.path}</span>
                                    </div>
                                    <button 
                                        onClick={() => handleDelete(dir.ID)}
                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}
        
        {activeTab === 'local' && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-6 border-b border-border bg-muted/20">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Upload className="text-primary" />
                        Local Bulk Upload
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Select a folder on your computer. All EPUB and PDF files found will be uploaded.
                    </p>
                </div>

                <div className="p-6">
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-border rounded-2xl bg-secondary/5 mb-6 text-center">
                        <input
                            type="file"
                            webkitdirectory="true"
                            directory="true"
                            onChange={handleFileSelect}
                            ref={fileInputRef}
                            className="hidden"
                        />
                        <div className="bg-primary/10 p-4 rounded-full mb-4">
                            <Laptop size={40} className="text-primary" />
                        </div>
                        <h3 className="text-lg font-bold mb-2">Select a Local Folder</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mb-6">
                            Pick a folder from your device. We'll automatically identify all compatible book files (.epub, .pdf, .cbr, .cbz) inside.
                        </p>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-primary text-primary-foreground font-black px-8 py-3 rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95"
                        >
                            <FolderSearch size={20} />
                            Choose Folder
                        </button>
                    </div>

                    {selectedFiles.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-sm">
                                    Selected Files ({selectedFiles.length})
                                </h3>
                                <button 
                                    onClick={handleBulkUpload}
                                    disabled={isUploading || selectedFiles.every(f => f.status === 'success')}
                                    className="bg-foreground text-background text-xs font-black px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2 active:scale-95"
                                >
                                    {isUploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
                                    Upload {selectedFiles.filter(f => f.status === 'pending' || f.status === 'error').length} Files
                                </button>
                                <button 
                                    onClick={() => setSelectedFiles([])}
                                    disabled={isUploading}
                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all disabled:opacity-50"
                                    title="Clear list"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
                                {selectedFiles.map(fileObj => (
                                    <div key={fileObj.id} className="p-3 bg-secondary/10 border border-border rounded-xl">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <FileText size={16} className="text-muted-foreground shrink-0" />
                                                <span className="text-xs font-medium truncate">{fileObj.file.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {fileObj.status === 'success' && <CheckCircle2 size={16} className="text-green-500" />}
                                                {fileObj.status === 'error' && (
                                                    <div className="group relative">
                                                        <AlertCircle size={16} className="text-destructive cursor-help" />
                                                        <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-destructive text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                                            {fileObj.error}
                                                        </div>
                                                    </div>
                                                )}
                                                {fileObj.status === 'uploading' && <span className="text-[10px] font-bold text-primary animate-pulse">Uploading...</span>}
                                                <span className="text-[10px] font-mono text-muted-foreground">
                                                    {(fileObj.file.size / (1024 * 1024)).toFixed(2)} MB
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-full h-1.5 bg-secondary/30 rounded-full overflow-hidden">
                                            <div 
                                                className={cn(
                                                    "h-full transition-all duration-300",
                                                    fileObj.status === 'error' ? "bg-destructive" : "bg-primary"
                                                )}
                                                style={{ width: `${fileObj.progress}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
