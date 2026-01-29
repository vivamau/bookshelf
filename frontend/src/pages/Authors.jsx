import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authorsApi } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { 
  User, 
  Search,
  ChevronDown, 
  LayoutGrid, 
  List, 
  SlidersHorizontal,
  Play,
  Shuffle,
  Plus,
  X,
  Loader,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn, formatDate } from "@/lib/utils";

export default function Authors() {
  const { hasPermission } = useAuth();
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const navigate = useNavigate();

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalAuthors, setTotalAuthors] = useState(0);

  // Add Author State
  const [isAddingAuthor, setIsAddingAuthor] = useState(false);
  const [newAuthor, setNewAuthor] = useState({ author_name: '', author_lastname: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchAuthors = async (pageToFetch, search = '', limitToFetch = 50) => {
    try {
      setLoading(true);
      const res = await authorsApi.getAll({ page: pageToFetch, limit: limitToFetch, search });
      setAuthors(res.data.data || []);
      setTotalAuthors(res.data.total || 0);
    } catch (err) {
      console.error("Failed to fetch authors", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
        setPage(1);
        fetchAuthors(1, searchTerm, limit);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, limit]);

  // Handle pagination
  useEffect(() => {
    fetchAuthors(page, searchTerm, limit);
  }, [page]);

  const handleAddAuthor = async (e) => {
    e.preventDefault();
    if (!newAuthor.author_name) {
        setError('First Name is required');
        return;
    }
    
    setSubmitting(true);
    setError('');

    try {
        const res = await authorsApi.create({
            author_name: newAuthor.author_name,
            author_lastname: newAuthor.author_lastname,
            author_create_date: Date.now(),
            author_update_date: Date.now()
        });
        
        // Refresh list
        const refreshRes = await authorsApi.getAll({ page, limit, search: searchTerm });
        setAuthors(refreshRes.data.data || []);
        setTotalAuthors(refreshRes.data.total || 0);
        setIsAddingAuthor(false);
        setNewAuthor({ author_name: '', author_lastname: '' });
        
    } catch (err) {
        console.error("Failed to create author", err);
        setError(err.response?.data?.error || 'Failed to create author');
    } finally {
        setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(totalAuthors / limit);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-background">
       {/* Background Decoration */}
       <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2" />

      {/* Authors Toolbar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-background/95 backdrop-blur z-20">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>All</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>
            
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>Authors</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>By Name</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>

            <div className="h-6 w-px bg-white/10 mx-2" />
            
            <span className="text-xl font-bold text-foreground">{totalAuthors}</span>
            
            {hasPermission('userrole_managebooks') && (
                <button 
                    onClick={() => setIsAddingAuthor(true)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95"
                >
                    <Plus size={16} />
                    Create Author
                </button>
            )}
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                    placeholder="Search authors..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-1.5 text-sm outline-none focus:border-primary/50 transition-all w-48 focus:w-64"
                />
            </div>
            
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-white/10 text-foreground" : "hover:text-foreground")}
                >
                    <LayoutGrid size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-white/10 text-foreground" : "hover:text-foreground")}
                >
                    <List size={18} />
                </button>
            </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
          <div className="flex-1 overflow-y-auto px-8 md:px-12 py-12 custom-scrollbar">
              {loading ? (
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 animate-pulse">
                    {[1,2,3,4,5,6,7,8,9,10].map(i => (
                      <div key={i} className="h-32 bg-muted/40 rounded-xl" />
                    ))}
                 </div>
              ) : viewMode === 'list' ? (
                  <div className="w-full">
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="border-b border-white/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  <th className="py-4 pl-4 w-16"></th>
                                  <th className="py-4">Name</th>
                                  <th className="py-4">Role</th>
                                  <th className="py-4">Added</th>
                              </tr>
                          </thead>
                          <tbody>
                              {authors.map(author => (
                                  <tr 
                                    key={author.ID} 
                                    onClick={() => navigate(`/author/${author.ID}`)}
                                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
                                  >
                                      <td className="py-3 pl-4">
                                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground overflow-hidden shrink-0">
                                              <img 
                                                  src={author.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author.author_name}${author.author_lastname}`} 
                                                  alt={author.author_name}
                                                  className="w-full h-full object-cover"
                                              />
                                          </div>
                                      </td>
                                      <td className="py-3 font-bold text-foreground group-hover:text-primary transition-colors">
                                          {author.author_name} {author.author_lastname}
                                      </td>
                                      <td className="py-3 text-sm text-muted-foreground">Writer</td>
                                      <td className="py-3 text-sm text-muted-foreground">
                                          {formatDate(author.author_create_date)}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              ) : (
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-4">
                    {authors.map(author => (
                      <div 
                        key={author.ID}
                        onClick={() => navigate(`/author/${author.ID}`)}
                        className="bg-card hover:bg-muted/50 border border-border/40 hover:border-primary/20 rounded-xl p-6 flex flex-col items-center text-center gap-4 cursor-pointer group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
                      >
                         <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-muted-foreground overflow-hidden shrink-0 transition-all group-hover:scale-105 border-4 border-transparent group-hover:border-primary/20">
                            <img 
                                src={author.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author.author_name}${author.author_lastname}`} 
                                alt={author.author_name}
                                className="w-full h-full object-cover"
                            />
                         </div>
                         <div className="flex flex-col gap-0.5">
                            <span className="text-lg font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                              {author.author_name} {author.author_lastname}
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Writer
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 mt-1">
                                Added on {formatDate(author.author_create_date)}
                            </span>
                         </div>
                      </div>
                    ))}
                 </div>
              )}

              {!loading && authors.length === 0 && (
                 <div className="text-center py-20 opacity-50">
                    <p className="text-xl font-bold">No authors found</p>
                    <p className="text-sm">Try searching for a different name.</p>
                 </div>
              )}
          </div>

          {/* Pagination Footer */}
          <div className="px-8 py-4 border-t border-white/5 bg-background/95 backdrop-blur z-20 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                  <span>Rows per page:</span>
                  <select 
                      value={limit} 
                      onChange={(e) => {
                          setLimit(Number(e.target.value));
                          setPage(1); // Reset to page 1 when changing limit
                      }}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1 outline-none focus:border-primary/50 text-foreground cursor-pointer"
                  >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                  </select>
              </div>

              <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                      <button 
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-muted-foreground"
                      >
                          <ChevronLeft size={18} />
                      </button>

                      {/* Page Numbers */}
                      <div className="flex items-center gap-1">
                        {(() => {
                            const pages = [];
                            
                            if (totalPages <= 7) {
                                for (let i = 1; i <= totalPages; i++) pages.push(i);
                            } else {
                                if (page <= 4) {
                                    for (let i = 1; i <= 5; i++) pages.push(i);
                                    pages.push('...');
                                    pages.push(totalPages);
                                } else if (page >= totalPages - 3) {
                                    pages.push(1);
                                    pages.push('...');
                                    for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
                                } else {
                                    pages.push(1);
                                    pages.push('...');
                                    pages.push(page - 1);
                                    pages.push(page);
                                    pages.push(page + 1);
                                    pages.push('...');
                                    pages.push(totalPages);
                                }
                            }

                            return pages.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => typeof p === 'number' && setPage(p)}
                                    disabled={p === '...'}
                                    className={cn(
                                        "w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all",
                                        p === page 
                                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110" 
                                            : p === '...' 
                                                ? "text-muted-foreground cursor-default" 
                                                : "hover:bg-white/10 text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {p}
                                </button>
                            ));
                        })()}
                      </div>

                      <button 
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page >= totalPages}
                          className="p-1.5 rounded-lg hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-muted-foreground"
                      >
                          <ChevronRight size={18} />
                      </button>
                  </div>
              </div>
          </div>
      </div>

       {/* Add Author Modal */}
       {isAddingAuthor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button 
                    onClick={() => setIsAddingAuthor(false)}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X size={20} />
                </button>
                
                <h2 className="text-2xl font-black tracking-tight mb-2">Add New Author</h2>
                <p className="text-muted-foreground text-sm mb-6">Create a new author profile manually.</p>
                
                <form onSubmit={handleAddAuthor} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">First Name</label>
                        <input 
                            autoFocus
                            value={newAuthor.author_name}
                            onChange={e => setNewAuthor({...newAuthor, author_name: e.target.value})}
                            placeholder="e.g. Stephen"
                            className="bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-sm font-medium outline-none focus:border-primary/50 transition-all"
                        />
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Last Name</label>
                        <input 
                            value={newAuthor.author_lastname}
                            onChange={e => setNewAuthor({...newAuthor, author_lastname: e.target.value})}
                            placeholder="e.g. King"
                            className="bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-sm font-medium outline-none focus:border-primary/50 transition-all"
                        />
                    </div>

                    {error && (
                        <div className="bg-destructive/10 text-destructive text-xs font-bold px-4 py-3 rounded-lg flex items-center gap-2">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-4">
                         <button 
                            type="button"
                            onClick={() => setIsAddingAuthor(false)}
                            className="flex-1 py-3 rounded-xl font-bold text-sm bg-secondary/50 hover:bg-secondary text-foreground transition-colors"
                         >
                            Cancel
                         </button>
                         <button 
                            type="submit"
                            disabled={submitting || !newAuthor.author_name}
                            className="flex-1 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                         >
                            {submitting ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                            Create Author
                         </button>
                    </div>
                </form>
            </div>
        </div>
       )}
    </div>
  );
}
