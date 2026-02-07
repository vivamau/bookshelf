import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { booksApi } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { 
  ChevronDown, 
  LayoutGrid, 
  List, 
  SlidersHorizontal,
  BookOpen,
  Check,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { cn, formatDate } from "@/lib/utils";

export default function Library() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalBooks, setTotalBooks] = useState(0);
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('latest');
  const [searchTerm, setSearchTerm] = useState('');
  const [format, setFormat] = useState('all'); // 'all', 'EPUB', 'PDF'
  const navigate = useNavigate();

    const fetchBooks = async (pageToFetch, search = '', limitToFetch = 50, sortParam = 'title', formatParam = 'all') => {
    try {
      setLoading(true);
      const res = await booksApi.getAll({ page: pageToFetch, limit: limitToFetch, search, sort: sortParam, format: formatParam });
      setBooks(res.data.data || []);
      setTotalBooks(res.data.total || 0);
    } catch (err) {
      console.error("Failed to fetch books", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search and handle sort/limit/format changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
        setPage(1);
        fetchBooks(1, searchTerm, limit, sortBy, format);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, limit, sortBy, format]);

  // Handle pagination
  useEffect(() => {
    fetchBooks(page, searchTerm, limit, sortBy, format);
  }, [page]);

  const sortedBooks = useMemo(() => {
    // We rely on backend sorting for paginated results
    return books;
  }, [books]);
  
  const [bookToDelete, setBookToDelete] = useState(null);
  const { user } = useAuth();
  
  
  // Robust check for delete permission (handles 1/0 or true/false)
  const canDelete = !!user?.userrole_managebooks;
  // console.log("User permissions debug:", { user, canDelete });

  const confirmDelete = (e, book) => {
      e.stopPropagation();
      setBookToDelete(book);
  };

  const handleDelete = async () => {
      if (!bookToDelete) return;
      try {
          await booksApi.delete(bookToDelete.ID);
          fetchBooks(page, searchTerm, limit, sortBy, format);
          setBookToDelete(null);
      } catch (err) {
          console.error("Failed to delete book", err);
      }
  };

  const totalPages = Math.ceil(totalBooks / limit);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Library Toolbar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-background/95 backdrop-blur z-20">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors relative group/filter">
                <span>{format === 'all' ? 'All' : format}</span>
                <ChevronDown size={14} className="text-muted-foreground" />
                
                <div className="absolute top-full left-0 mt-2 w-40 bg-card border border-border rounded-lg shadow-xl overflow-hidden opacity-0 invisible group-hover/filter:opacity-100 group-hover/filter:visible transition-all z-50 py-1">
                    <div onClick={() => setFormat('all')} className={cn("px-4 py-2.5 hover:bg-white/5 text-xs font-bold", format === 'all' && "text-primary")}>All</div>
                    <div onClick={() => setFormat('EPUB')} className={cn("px-4 py-2.5 hover:bg-white/5 text-xs font-bold", format === 'EPUB' && "text-primary")}>EPUB</div>
                    <div onClick={() => setFormat('PDF')} className={cn("px-4 py-2.5 hover:bg-white/5 text-xs font-bold", format === 'PDF' && "text-primary")}>PDF</div>
                </div>
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors relative group/sort">
                <span className="capitalize">{sortBy === 'latest' ? 'Recently Added' : `By ${sortBy}`}</span>
                <ChevronDown size={14} className="text-muted-foreground" />
                
                <div className="absolute top-full left-0 mt-2 w-40 bg-card border border-border rounded-lg shadow-xl overflow-hidden opacity-0 invisible group-hover/sort:opacity-100 group-hover/sort:visible transition-all z-50 py-1">
                    <div onClick={() => setSortBy('latest')} className={cn("px-4 py-2.5 hover:bg-white/5 text-xs font-bold", sortBy === 'latest' && "text-primary")}>Recently Added</div>
                    <div onClick={() => setSortBy('title')} className={cn("px-4 py-2.5 hover:bg-white/5 text-xs font-bold", sortBy === 'title' && "text-primary")}>By Title</div>
                    <div onClick={() => setSortBy('year')} className={cn("px-4 py-2.5 hover:bg-white/5 text-xs font-bold", sortBy === 'year' && "text-primary")}>By Year</div>
                </div>
            </div>

            <div className="h-6 w-px bg-white/10 mx-2" />
            
            <span className="text-xl font-bold text-foreground">{totalBooks}</span>
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                    placeholder="Search library..." 
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

      <div className="flex flex-1 overflow-hidden relative flex-col">
          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
              {loading ? (
                   <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-10 gap-x-6 gap-y-10">
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
                                  {canDelete && <th className="py-4 w-10"></th>}
                              </tr>
                          </thead>
                          <tbody>
                              {sortedBooks.map((book) => (
                                  <tr 
                                    key={book.ID} 
                                    id={`book-${book.ID}`}
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
                                      {canDelete && (
                                          <td className="py-3 pr-4">
                                              <button 
                                                  onClick={(e) => confirmDelete(e, book)}
                                                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                                  title="Delete Book"
                                              >
                                                  <Trash2 size={16} />
                                              </button>
                                          </td>
                                      )}
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              ) : (
                   <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-10 gap-x-6 gap-y-10 pb-4">
                       {sortedBooks.map((book) => (
                           <div 
                             key={book.ID} 
                             id={`book-${book.ID}`}
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

                                   {/* Delete Button (Librarian) */}
                                   {canDelete && (
                                       <button 
                                           onClick={(e) => confirmDelete(e, book)}
                                           className="absolute bottom-2 right-2 p-1.5 bg-destructive text-white rounded-md opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg z-30"
                                           title="Delete Book"
                                       >
                                           <Trash2 size={14} />
                                       </button>
                                   )}
                               </div>
                               
                               <div className="flex flex-col">
                                   <h3 className="font-bold text-sm text-foreground truncate leading-tight group-hover:text-primary transition-colors">{book.book_title}</h3>
                                   <p className="text-xs text-muted-foreground/70 font-medium mt-0.5">{book.book_date ? new Date(book.book_date).getFullYear() : 'Unknown'}</p>
                               </div>
                           </div>
                       ))}
                   </div>
              )}

              {sortedBooks.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-20 opacity-50">
                      <BookOpen size={48} className="mb-4 text-muted-foreground" />
                      <p className="text-xl font-bold">No books found</p>
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
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={150}>150</option>
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
                            const maxVisible = 5;
                            
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

      {/* Delete Confirmation Modal */}
      {bookToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200">
              <div className="bg-card w-full max-w-md rounded-xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6">
                      <h3 className="text-xl font-bold mb-2">Delete Book?</h3>
                      <p className="text-muted-foreground text-sm">
                          Are you sure you want to delete <span className="font-bold text-foreground">"{bookToDelete.book_title}"</span>? 
                          This action cannot be undone and will remove the file from your library.
                      </p>
                  </div>
                  <div className="bg-secondary/50 p-4 flex justify-end gap-3 border-t border-border/50">
                      <button 
                          onClick={() => setBookToDelete(null)}
                          className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
                      >
                          Cancel
                      </button>
                      <button 
                          onClick={handleDelete}
                          className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors shadow-lg shadow-destructive/20"
                      >
                          Delete Book
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
