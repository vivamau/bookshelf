
import React, { useState, useEffect } from 'react';
import { settingsApi } from '../api/api';
import { FolderPlus, Trash2, Folder, FolderSearch, ChevronRight, ChevronUp, Loader, X } from 'lucide-react';
import { cn } from "@/lib/utils";

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
  const [directories, setDirectories] = useState([]);
  const [newPath, setNewPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

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
    fetchDirectories();
  }, []);

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

  return (
    <div className="flex-1 overflow-y-auto bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-black tracking-tight mb-8">Settings</h1>
        
        <div className="bg-card border border-border rounded-xl overflow-hidden">
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
                            className="flex-1 bg-secondary/30 border border-input rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                        <button
                            type="button"
                            onClick={() => setShowBrowser(true)}
                            className="bg-secondary text-foreground p-2 rounded-lg hover:bg-white/10 transition-colors border border-input"
                            title="Browse Server Folders"
                        >
                            <FolderSearch size={20} />
                        </button>
                    </div>
                    <button 
                        type="submit"
                        className="bg-primary text-primary-foreground font-bold px-6 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
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
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4 border border-destructive/20">
                        {error}
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    {loading ? (
                        <div className="text-muted-foreground italic">Loading...</div>
                    ) : directories.length === 0 ? (
                        <div className="text-center py-10 bg-secondary/20 rounded-lg text-muted-foreground border border-dashed border-border">
                            No external import folders configured.
                        </div>
                    ) : (
                        directories.map(dir => (
                            <div key={dir.ID} className="flex items-center justify-between p-4 bg-secondary/10 border border-border rounded-lg group hover:bg-secondary/20 transition-colors">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <Folder size={18} className="text-muted-foreground shrink-0" />
                                    <span className="font-mono text-sm truncate">{dir.path}</span>
                                </div>
                                <button 
                                    onClick={() => handleDelete(dir.ID)}
                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
