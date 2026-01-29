import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ListPlus, 
  Book, 
  Users, 
  Trash2,
  Plus, 
  LayoutGrid,
  List,
  Eye,
  EyeOff
} from 'lucide-react';
import { readlistsApi } from '../api/api';
import { cn } from "@/lib/utils";

export default function Readlists() {
  const [readlists, setReadlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const fetchReadlists = async () => {
    try {
      setLoading(true);
      const res = await readlistsApi.getAll();
      setReadlists(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch readlists", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReadlists();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    
    setCreating(true);
    try {
      await readlistsApi.create({ readlist_title: newListName });
      setNewListName('');
      setShowCreateModal(false);
      fetchReadlists();
    } catch (err) {
      console.error("Failed to create readlist", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation(); // Prevent navigation
    if (!window.confirm("Are you sure you want to delete this readlist?")) return;

    try {
      await readlistsApi.delete(id);
      fetchReadlists();
    } catch (err) {
      console.error("Failed to delete readlist", err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-hidden animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between p-8 border-b border-white/5 bg-background/50 backdrop-blur-xl z-20 sticky top-0">
          <div>
              <h1 className="text-4xl font-black tracking-tighter text-foreground mb-2 flex items-center gap-3">
                  <ListPlus size={32} className="text-primary" />
                  Your Readlists
              </h1>
              <p className="text-muted-foreground font-medium max-w-xl">
                  Organize your reading journey with custom collections.
              </p>
          </div>
          
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-black uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} strokeWidth={3} />
            Create New
          </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : readlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 text-center opacity-50">
            <ListPlus size={64} className="mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">No Readlists Yet</h2>
            <p className="text-muted-foreground">Create your first collection to start organizing your books.</p>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="mt-6 text-primary font-bold hover:underline"
            >
              Create Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {readlists.map((list) => (
              <div 
                key={list.ID} 
                onClick={() => navigate(`/readlist/${list.ID}`)}
                className="group relative bg-card border border-border/50 hover:border-primary/50 overflow-hidden rounded-xl transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,0,0,0.2)] cursor-pointer"
              >
                  {/* Card Header Pattern */}
                  <div className="h-24 bg-gradient-to-br from-primary/10 to-transparent relative overflow-hidden group-hover:from-primary/20 transition-colors">
                      <ListPlus size={120} className="absolute -bottom-8 -right-8 text-primary/5 rotate-12 group-hover:rotate-6 transition-transform duration-500" />
                      
                      <span className={cn(
                          "absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border z-10 bg-background/50 backdrop-blur-sm",
                          list.readlist_visible === 0 
                              ? "text-destructive border-destructive/30" 
                              : "text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
                      )}>
                         {list.readlist_visible === 0 ? <EyeOff size={12} /> : <Eye size={12} />}
                         {list.readlist_visible === 0 ? 'Private' : 'Public'}
                      </span>
                  </div>
                  
                  <div className="p-6 relative">
                      <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-1">{list.readlist_title}</h3>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
                          <span className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded">
                              <Book size={14} />
                              {list.book_count || 0} Books
                          </span>
                          <span className="text-xs opacity-60">
                              Updated {new Date(list.readlist_update_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          
                          <button 
                            onClick={(e) => handleDelete(e, list.ID)}
                            className="ml-auto p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all opacity-0 group-hover:opacity-100"
                            title="Delete Readlist"
                          >
                              <Trash2 size={14} />
                          </button>
                      </div>
                  </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-md w-full p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold mb-2">Create New Readlist</h3>
            <p className="text-muted-foreground text-sm mb-6">Give your collection a name.</p>
            
            <form onSubmit={handleCreate}>
              <input 
                autoFocus
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder="My Favorites..."
                className="w-full bg-background border border-input rounded-lg px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 mb-6"
              />
              
              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-2 rounded-lg font-bold text-sm bg-muted text-foreground hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={creating || !newListName.trim()}
                  className="px-6 py-2 rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {creating ? 'Creating...' : 'Create List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
