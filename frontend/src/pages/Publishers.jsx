import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { publishersApi } from '../api/api';
import { 
  Building2, 
  Search,
  ChevronDown, 
  LayoutGrid, 
  List, 
  SlidersHorizontal,
  Play,
  Shuffle,
  BookOpen,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from "@/lib/utils";

export default function Publishers() {
  const [publishers, setPublishers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const navigate = useNavigate();

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPublishers, setTotalPublishers] = useState(0);

  const fetchPublishers = async (pageToFetch, search = '', limitToFetch = 50) => {
    try {
      setLoading(true);
      const res = await publishersApi.getAll({ page: pageToFetch, limit: limitToFetch, search });
      setPublishers(res.data.data || []);
      setTotalPublishers(res.data.total || 0);
    } catch (err) {
      console.error("Failed to fetch publishers", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
        setPage(1);
        fetchPublishers(1, searchTerm, limit);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, limit]);

  // Handle pagination
  useEffect(() => {
    fetchPublishers(page, searchTerm, limit);
  }, [page]);

  const totalPages = Math.ceil(totalPublishers / limit);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-background">
       {/* Background Decoration */}
       <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2" />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-background/95 backdrop-blur z-20">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>All</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>
            
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>Publishers</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>

            <div className="h-6 w-px bg-white/10 mx-2" />
            
            <span className="text-xl font-bold text-foreground">{totalPublishers}</span>
            
            <div className="flex-1 max-w-sm relative group ml-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="Search publishers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-secondary/30 border border-transparent focus:border-primary/20 focus:bg-secondary/50 rounded-full py-1.5 pl-10 pr-4 text-xs transition-all outline-none"
              />
            </div>
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
            <SlidersHorizontal size={20} className="hover:text-foreground cursor-pointer transition-colors" />
            
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
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 animate-pulse">
                    {[1,2,3,4,5,6,7,8,9,10].map(i => (
                      <div key={i} className="h-40 bg-muted/40 rounded-xl" />
                    ))}
                 </div>
              ) : viewMode === 'list' ? (
                  <div className="w-full">
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="border-b border-white/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  <th className="py-4 pl-4 w-16"></th>
                                  <th className="py-4">Company Name</th>
                                  <th className="py-4">Type</th>
                              </tr>
                          </thead>
                          <tbody>
                              {publishers.map(pub => (
                                  <tr 
                                    key={pub.ID} 
                                    onClick={() => navigate(`/publisher/${pub.ID}`)}
                                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
                                  >
                                      <td className="py-3 pl-4">
                                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground overflow-hidden shrink-0">
                                              <Building2 size={20} />
                                          </div>
                                      </td>
                                      <td className="py-3 font-bold text-foreground group-hover:text-primary transition-colors">
                                          {pub.publisher_name}
                                      </td>
                                      <td className="py-3 text-sm text-muted-foreground">Publisher</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-4">
                    {publishers.map(pub => (
                      <div 
                        key={pub.ID}
                        onClick={() => navigate(`/publisher/${pub.ID}`)}
                        className="bg-card hover:bg-muted/50 border border-border/40 hover:border-primary/20 rounded-xl p-6 flex flex-col items-center text-center gap-4 cursor-pointer group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
                      >
                         <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground shrink-0 transition-all group-hover:scale-105 group-hover:bg-primary/10 group-hover:text-primary">
                            <Building2 size={32} />
                         </div>
                         <div className="flex flex-col gap-0.5">
                            <span className="text-lg font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                              {pub.publisher_name}
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">
                              Publishing House
                            </span>
                         </div>
                      </div>
                    ))}
                 </div>
              )}

              {!loading && publishers.length === 0 && (
                 <div className="text-center py-20 opacity-50">
                    <Building2 size={48} className="mx-auto mb-4 text-muted-foreground" />
                    <p className="text-xl font-bold">No publishers found</p>
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
    </div>
  );
}
