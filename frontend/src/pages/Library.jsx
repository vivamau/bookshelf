import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { booksApi } from '../api/api';
import { 
  ChevronDown, 
  LayoutGrid, 
  List, 
  SlidersHorizontal,
  Play,
  Shuffle,
  BookOpen,
  Check,
  RefreshCw
} from 'lucide-react';
import { cn, formatDate } from "@/lib/utils";

export default function Library() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalBooks, setTotalBooks] = useState(0);
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('title'); // title, date, year
  const navigate = useNavigate();
  
  const observer = useRef();
  const lastBookElementRef = useCallback(node => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  const fetchBooks = async (pageToFetch) => {
    try {
      if (pageToFetch === 1) setLoading(true);
      else setLoadingMore(true);

      const res = await booksApi.getAll({ page: pageToFetch, limit: 50 });
      const newBooks = res.data.data || [];
      
      setBooks(prev => pageToFetch === 1 ? newBooks : [...prev, ...newBooks]);
      setTotalBooks(res.data.total || 0);
      setHasMore(newBooks.length === 50);
    } catch (err) {
      console.error("Failed to fetch books", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchBooks(page);
  }, [page]);

  const alphaIndex = useMemo(() => {
    return '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  }, []);

  const sortedBooks = useMemo(() => {
    // Note: Filtering/Sorting here only applies to CURRENTLY LOADED books.
    // In a real paginated app, sorting often happens on the backend.
    return [...books].sort((a, b) => {
        if (sortBy === 'title') {
            return a.book_title.localeCompare(b.book_title);
        }
        return 0;
    });
  }, [books, sortBy]);

  const scrollToLetter = (char) => {
    const target = sortedBooks.find(b => {
        const firstChar = b.book_title.charAt(0).toUpperCase();
        if (char === '#') return !/[A-Z]/.test(firstChar);
        return firstChar === char;
    });
    
    if (target) {
        const el = document.getElementById(`book-${target.ID}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Library Toolbar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-background/95 backdrop-blur z-20">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>All</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>
            
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>Books</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>By Title</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>

            <div className="h-6 w-px bg-white/10 mx-2" />
            
            <span className="text-xl font-bold text-foreground">{totalBooks}</span>
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
            <Play size={20} className="hover:text-foreground cursor-pointer transition-colors" />
            <Shuffle size={20} className="hover:text-foreground cursor-pointer transition-colors" />
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

      <div className="flex flex-1 overflow-hidden relative">
          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
              {loading ? (
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-x-6 gap-y-10">
                       {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                           <div key={i} className="flex flex-col gap-3">
                               <div className="aspect-[2/3] bg-muted/20 rounded-lg animate-pulse" />
                               <div className="h-4 bg-muted/20 rounded w-3/4 animate-pulse" />
                           </div>
                       ))}
                   </div>
              ) : viewMode === 'list' ? (
                  <div className="w-full">
                      <table className="w-full text-left border-collapse">
                          <thead>
                              <tr className="border-b border-white/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                  <th className="py-4 pl-4 w-16">Cover</th>
                                  <th className="py-4">Title</th>
                                  <th className="py-4">Year</th>
                                  <th className="py-4">Progress</th>
                                  <th className="py-4">Added</th>
                              </tr>
                          </thead>
                          <tbody>
                              {sortedBooks.map((book, index) => (
                                  <tr 
                                    key={book.ID} 
                                    id={`book-${book.ID}`}
                                    ref={index === sortedBooks.length - 1 ? lastBookElementRef : null}
                                    onClick={() => navigate(`/book/${book.ID}`)}
                                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
                                  >
                                      <td className="py-3 pl-4">
                                          <div className="w-10 h-14 bg-muted/20 rounded overflow-hidden shrink-0">
                                              <img 
                                                src={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : `https://api.dicebear.com/7.x/initials/svg?seed=${book.book_title}`} 
                                                alt={book.book_title}
                                                className="w-full h-full object-cover"
                                              />
                                          </div>
                                      </td>
                                      <td className="py-3 font-bold text-foreground group-hover:text-primary transition-colors">
                                          {book.book_title.split(' ').length > 7 ? book.book_title.split(' ').slice(0, 7).join(' ') + '...' : book.book_title}
                                      </td>
                                      <td className="py-3 text-sm text-muted-foreground">
                                          {book.book_date ? new Date(book.book_date).getFullYear() : 'Unknown'}
                                      </td>
                                      <td className="py-3 pr-8">
                                          <div className="flex items-center gap-3">
                                              <div className="h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
                                                  <div className="h-full bg-primary rounded-full" style={{ width: `${book.book_progress_percentage || 0}%` }} />
                                              </div>
                                          </div>
                                      </td>
                                      <td className="py-3 text-sm text-muted-foreground">
                                          {formatDate(book.book_create_date)}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              ) : (
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-x-6 gap-y-10 pb-20">
                       {sortedBooks.map((book, index) => (
                           <div 
                             key={book.ID} 
                             id={`book-${book.ID}`}
                             ref={index === sortedBooks.length - 1 ? lastBookElementRef : null}
                             onClick={() => navigate(`/book/${book.ID}`)}
                             className="group flex flex-col gap-2 cursor-pointer"
                           >
                               <div className="relative aspect-[2/3] rounded-sm overflow-hidden bg-muted/10 shadow-lg group-hover:shadow-xl transition-all duration-300">
                                   <img 
                                     src={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : `https://api.dicebear.com/7.x/initials/svg?seed=${book.book_title}`} 
                                     alt={book.book_title}
                                     className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                   />
                                   
                                   {/* Status Badge */}
                                   {(book.book_progress_percentage === 100 || book.read) && (
                                     <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md rounded-md p-1 border border-white/20 shadow-sm">
                                        <Check size={12} className="text-white" />
                                     </div>
                                   )}

                                   {/* Hover Overlay */}
                                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                               </div>
                               
                               <div className="flex flex-col">
                                   <h3 className="font-bold text-sm text-foreground truncate leading-tight group-hover:text-primary transition-colors">{book.book_title}</h3>
                                   <p className="text-xs text-muted-foreground/70 font-medium mt-0.5">{book.book_date ? new Date(book.book_date).getFullYear() : 'Unknown'}</p>
                               </div>
                           </div>
                       ))}
                   </div>
              )}

              {loadingMore && (
                  <div className="flex justify-center py-10 w-full animate-in fade-in zoom-in duration-300">
                      <div className="flex items-center gap-3 bg-white/5 px-6 py-3 rounded-full border border-white/10 shadow-xl">
                          <RefreshCw size={20} className="animate-spin text-primary" />
                          <span className="text-xs font-black uppercase tracking-widest text-foreground/80">Loading more books...</span>
                      </div>
                  </div>
              )}

              {!hasMore && totalBooks > 0 && !loading && (
                  <div className="flex justify-center py-20 w-full opacity-40">
                      <div className="flex flex-col items-center gap-2">
                        <BookOpen size={24} className="text-muted-foreground" />
                        <span className="text-[10px] font-black uppercase tracking-[3px]">The end of the library</span>
                      </div>
                  </div>
              )}
          </div>

          {/* Alpha Index Sidebar */}
          <div className="w-6 flex flex-col items-center justify-center py-4 z-10 select-none">
              <div className="flex flex-col gap-0.5">
                  {alphaIndex.map(char => (
                      <span 
                        key={char} 
                        onClick={() => scrollToLetter(char)}
                        className="text-[9px] font-bold text-muted-foreground hover:text-primary cursor-pointer w-4 h-3.5 flex items-center justify-center transition-colors hover:scale-110"
                      >
                          {char}
                      </span>
                  ))}
              </div>
          </div>
      </div>
    </div>
  );
}
