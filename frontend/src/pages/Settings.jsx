
import React, { useState, useEffect, useRef } from 'react';
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
    CheckCircle2, 
    AlertCircle,
    Server,
    Laptop,
    Type,
    Palette,
    Volume2
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useAuth } from '../context/AuthContext';

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
