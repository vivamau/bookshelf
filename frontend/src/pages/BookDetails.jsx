import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Play, 
  Plus, 
  Share2, 
  MoreHorizontal,
  Star,
  Download,
  BookOpen,
  Users,
  Pencil,
  Check,
  ChevronRight,
  ChevronDown,
  X,
  Trash2
} from 'lucide-react';
import { booksApi, genresApi, booksGenresApi } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

export default function BookDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ book_title: '', book_summary: '', book_isbn: '' });
  const [saving, setSaving] = useState(false);
  
  const [allGenres, setAllGenres] = useState([]);
  const [showGenreInput, setShowGenreInput] = useState(false);
  const [selectedGenreId, setSelectedGenreId] = useState('');
  const [isCreatingGenre, setIsCreatingGenre] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [genreToDelete, setGenreToDelete] = useState(null);
  const [showDeleteBookModal, setShowDeleteBookModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await booksApi.update(id, editForm);
      setBook(prev => ({ ...prev, ...editForm }));
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update book", err);
      alert("Failed to update book");
    } finally {
      setSaving(false);
    }
  };

  const handleAddGenre = async () => {
    if (!selectedGenreId && !newGenreName) return;
    try {
        let genreIdToObject = selectedGenreId;
        
        if (isCreatingGenre && newGenreName) {
            const createRes = await genresApi.create({ genere_title: newGenreName });
            // Assuming the backend returns { id: ..., ... } or data with insertId
            // The crudFactory returns { data: { id: ..., ... } }
            genreIdToObject = createRes.data.data.id || createRes.data.data.ID;
            
            // Refresh all genres
            const genresRes = await genresApi.getAll();
            setAllGenres(genresRes.data.data);
        }

        if (genreIdToObject) {
            await booksGenresApi.create({ book_id: id, genere_id: genreIdToObject });
             const res = await booksApi.getById(id);
             setBook(res.data.data);
        }

         setShowGenreInput(false);
         setSelectedGenreId('');
         setNewGenreName('');
         setIsCreatingGenre(false);
    } catch (err) {
        console.error("Failed to add genre", err);
    }
  };

  const handleRemoveGenre = (relationId) => {
    setGenreToDelete(relationId);
    setShowDeleteModal(true);
  };

  const confirmDeleteGenre = async () => {
     if (!genreToDelete) return;
     try {
        await booksGenresApi.delete(genreToDelete);
         // Refresh book data
         const res = await booksApi.getById(id);
         setBook(res.data.data);
         setShowDeleteModal(false);
         setGenreToDelete(null);
    } catch (err) {
        console.error("Failed to remove genre", err);
    }
  };

  const handleDeleteBook = async () => {
    setDeleting(true);
    try {
      await booksApi.delete(id);
      setShowDeleteBookModal(false);
      // Navigate back to home after successful deletion
      navigate('/');
    } catch (err) {
      console.error("Failed to delete book", err);
      alert("Failed to delete book");
      setDeleting(false);
    }
  };

  useEffect(() => {
    const loadGenres = async () => {
        try {
            const res = await genresApi.getAll();
            setAllGenres(res.data.data);
        } catch (err) {
            console.error("Failed to load genres", err);
        }
    };
    loadGenres();
  }, []);

  useEffect(() => {
    const fetchBook = async () => {
      try {
        const res = await booksApi.getById(id);
        const bookData = res.data.data;
        setBook(bookData);
        setEditForm({
            book_title: bookData.book_title,
            book_summary: bookData.book_summary,
            book_isbn: bookData.book_isbn
        });
      } catch (err) {
        console.error("Failed to fetch book details", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBook();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
        <BookOpen size={64} className="mb-4 opacity-20" />
        <h2 className="text-2xl font-bold">Book not found</h2>
        <button onClick={() => navigate('/')} className="mt-4 text-primary font-bold hover:underline">Return Home</button>
      </div>
    );
  }

  const coverUrl = book.book_cover_img ? `http://localhost:3005/covers/${book.book_cover_img}` : `https://api.dicebear.com/7.x/initials/svg?seed=${book.book_title}`;

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-hidden animate-in fade-in duration-700">
      {/* Background Hero Blur */}
      <div className="absolute top-0 left-0 w-full h-[60vh] overflow-hidden pointer-events-none">
         <img src={coverUrl} alt="" className="w-full h-full object-cover blur-[100px] opacity-30 scale-110" />
         <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
      </div>

      {/* Main Content Scrollable */}
      <div className="flex-1 overflow-y-auto px-8 md:px-16 pt-12 pb-20 relative z-10 custom-scrollbar">
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-bold uppercase tracking-widest">Back</span>
        </button>

        <div className="flex flex-col md:flex-row gap-12 items-start">
          {/* Poster / Cover */}
          <div className="w-full max-w-[300px] shrink-0 self-center md:self-start">
            <div className="aspect-[2/3] rounded-lg overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group relative">
                <img src={coverUrl} alt={book.book_title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
            </div>
          </div>

          {/* Metadata */}
          <div className="flex-1 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                 <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-black rounded uppercase tracking-wider">Book</span>
                 <span className="text-muted-foreground text-sm font-bold tracking-tight">{book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}</span>
                 <span className="flex items-center gap-1.5 text-muted-foreground text-xs font-bold bg-white/5 px-2 py-0.5 rounded-full">
                    <Users size={12} className="text-primary" />
                    {book.readers_count || 0} Readers
                 </span>
              </div>
              {isEditing ? (
                <input 
                  value={editForm.book_title}
                  onChange={e => setEditForm({...editForm, book_title: e.target.value})}
                  className="text-4xl md:text-6xl font-black tracking-tighter text-foreground leading-none bg-white/5 border-b-2 border-primary outline-none py-2 w-full"
                />
              ) : (
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-foreground leading-none">{book.book_title}</h1>
              )}
              <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                 <div className="flex items-center gap-1">
                    {book.authors_data && typeof book.authors_data === 'string' ? book.authors_data.split('||').map((authorStr, idx) => {
                      const parts = authorStr.split('::');
                      if (parts.length < 2) return null;
                      const [authId, authName] = parts;
                      return (
                        <React.Fragment key={authId}>
                          <button 
                            onClick={() => navigate(`/author/${authId}`)}
                            className="text-primary font-bold hover:underline"
                          >
                            {authName}
                          </button>
                          {idx < book.authors_data.split('||').length - 1 && <span>, </span>}
                        </React.Fragment>
                      );
                    }) : <span className="text-primary font-bold">Unknown Author</span>}
                 </div>
                 <span>•</span>
                 <span>{book.language_name || 'English'}</span>
                 <span>•</span>
                 <span>{book.format_name || 'Epub'}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-4 mt-4">
              {hasPermission('userrole_managebooks') && (
                <>
                  {isEditing ? (
                    <div className="flex gap-2">
                       <button 
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full font-bold text-sm transition-all"
                       >
                         {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={18} />}
                         SAVE
                       </button>
                       <button 
                        onClick={() => setIsEditing(false)}
                        className="flex items-center gap-2 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full font-bold text-sm transition-all"
                       >
                         CANCEL
                       </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-6 py-2 rounded-full font-bold text-sm transition-all border"
                        style={{ backgroundColor: '#8bad0d20', borderColor: '#8bad0d50', color: '#8bad0d' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#8bad0d30'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#8bad0d20'}
                      >
                        <Pencil size={18} />
                        EDIT DETAILS
                      </button>
                      <button 
                        onClick={() => setShowDeleteBookModal(true)}
                        className="flex items-center gap-2 px-6 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-full font-bold text-sm transition-all border border-primary/30"
                      >
                        <Trash2 size={18} />
                        DELETE BOOK
                      </button>
                    </div>
                  )}
                </>
              )}
              
              <button 
                disabled={!hasPermission('userrole_readbooks')}
                onClick={() => {
                  if (book.book_entry_point) {
                    navigate(`/reader/${id}`);
                  } else {
                    alert('Preview not available for this book.');
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-8 py-3 rounded-full font-black text-sm uppercase tracking-wider transition-all shadow-lg active:scale-95",
                  hasPermission('userrole_readbooks') 
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20" 
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <Play size={18} fill="currentColor" />
                {book.book_progress_percentage > 0 ? `Continue (${Math.floor(book.book_progress_percentage)}%)` : 'Read Now'}
              </button>
              
              <button className="flex items-center gap-3 px-8 py-3 bg-secondary/80 hover:bg-secondary text-foreground rounded-full font-black text-sm uppercase tracking-wider transition-all border border-white/5 active:scale-95 backdrop-blur-sm">
                <Plus size={18} />
                Read List
              </button>

              <div className="h-12 w-12 flex items-center justify-center rounded-full bg-secondary/50 border border-white/5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors backdrop-blur-sm">
                <Share2 size={20} />
              </div>

              <div className="h-12 w-12 flex items-center justify-center rounded-full bg-secondary/50 border border-white/5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors backdrop-blur-sm">
                <Download size={20} />
              </div>
              
              <div className="h-12 w-12 flex items-center justify-center rounded-full bg-secondary/50 border border-white/5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors backdrop-blur-sm">
                <MoreHorizontal size={20} />
              </div>
            </div>

            {/* Synopsis */}
            <div className="mt-4 max-w-3xl">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3 leading-none">Summary</h3>
              {isEditing ? (
                <textarea 
                  value={editForm.book_summary}
                  onChange={e => setEditForm({...editForm, book_summary: e.target.value})}
                  className="w-full min-h-[150px] bg-white/5 border border-white/10 rounded-lg p-4 text-foreground outline-none focus:border-primary transition-all text-lg leading-relaxed"
                />
              ) : (
                <p className="text-lg leading-relaxed text-foreground/80 font-medium whitespace-pre-line">
                  {book.book_summary || "No summary available for this title."}
                </p>
              )}
            </div>

            {/* Genres */}
            <div className="mt-8">
               <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground leading-none">Genres</h3>
                  {hasPermission('userrole_managebooks') && isEditing && !showGenreInput && (
                      <button onClick={() => setShowGenreInput(true)} className="p-1 hover:bg-white/10 rounded-full text-primary transition-colors">
                          <Plus size={14} />
                      </button>
                  )}
               </div>
               
               <div className="flex flex-wrap gap-2 items-center">
                  {book.genres_data ? book.genres_data.split('||').map(g => {
                      const parts = g.split('::');
                      if (parts.length < 3) return null;
                      const [relId, genreId, genreTitle] = parts;
                      return (
                          <div key={relId} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-bold text-foreground flex items-center gap-2 group">
                              <span>{genreTitle}</span>
                              {hasPermission('userrole_managebooks') && isEditing && (
                                  <button onClick={() => handleRemoveGenre(relId)} className="text-muted-foreground hover:text-destructive transition-colors">
                                      <X size={12} />
                                  </button>
                              )}
                          </div>
                      );
                  }) : (
                      <span className="text-sm text-muted-foreground italic">No genres added.</span>
                  )}
                  
                  {showGenreInput && (
                      <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                          {isCreatingGenre ? (
                              <input 
                                  className="bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-foreground outline-none focus:border-primary w-32"
                                  placeholder="New Genre Name"
                                  value={newGenreName}
                                  onChange={e => setNewGenreName(e.target.value)}
                                  autoFocus
                              />
                          ) : (
                              <div className="relative group/select">
                                <select 
                                   className="appearance-none bg-white/10 border border-white/20 hover:border-white/30 rounded-lg pl-4 pr-10 py-2 text-sm font-medium text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all cursor-pointer min-w-[160px]"
                                   value={selectedGenreId}
                                   onChange={e => {
                                       if (e.target.value === 'NEW') {
                                           setIsCreatingGenre(true);
                                           setSelectedGenreId('');
                                       } else {
                                           setSelectedGenreId(e.target.value);
                                       }
                                   }}
                                >
                                    <option value="" className="bg-slate-900 text-gray-400">Select Genre...</option>
                                    {allGenres.filter(ag => !book.genres_data?.includes(`::${ag.ID}::`)).map(ag => (
                                        <option key={ag.ID} value={ag.ID} className="bg-slate-900 text-white font-medium">{ag.genere_title}</option>
                                    ))}
                                    <option value="NEW" className="bg-slate-900 text-primary font-bold">+ Create New...</option>
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none group-hover/select:text-foreground transition-colors" />
                              </div>
                          )}

                          <button 
                            onClick={handleAddGenre} 
                            disabled={(!isCreatingGenre && !selectedGenreId) || (isCreatingGenre && !newGenreName)} 
                            className="p-1 bg-primary text-primary-foreground rounded-full disabled:opacity-50"
                          >
                              <Check size={12} />
                          </button>
                          
                          <button 
                            onClick={() => {
                                if (isCreatingGenre) {
                                    setIsCreatingGenre(false);
                                    setNewGenreName('');
                                } else {
                                    setShowGenreInput(false);
                                }
                            }} 
                            className="p-1 hover:bg-white/10 rounded-full"
                          >
                              <X size={12} />
                          </button>
                      </div>
                  )}
               </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mt-4 pt-8 border-t border-white/5">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Publisher</p>
                    <p className="text-sm font-bold text-foreground">{book.publisher_name || 'Unknown'}</p>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">ISBN</p>
                    {isEditing ? (
                      <input 
                        value={editForm.book_isbn}
                        onChange={e => setEditForm({...editForm, book_isbn: e.target.value})}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary focus:bg-white/15 transition-all w-full shadow-inner"
                        placeholder="000-0-00-000000-0"
                      />
                    ) : (
                      <p className="text-sm font-bold text-foreground">{book.book_isbn || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Added On</p>
                    <p className="text-sm font-bold text-foreground">
                        {book.book_create_date ? new Date(book.book_create_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                    <p className="text-sm font-bold text-primary">Available</p>
                </div>
            </div>
          </div>
        </div>

        {/* Similar Books Row */}
        <div className="mt-24">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black tracking-tight text-foreground">You Might Also Like</h3>
                <ChevronRight className="text-muted-foreground hover:text-primary cursor-pointer" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 opacity-50">
                {[1,2,3,4,5,6].map(i => (
                    <div key={i} className="aspect-[2/3] bg-muted rounded-md animate-pulse"></div>
                ))}
            </div>
        </div>

        {/* Custom Confirmation Modal */}
        {showDeleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-card border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
                    <h3 className="text-xl font-bold mb-2">Remove Genre?</h3>
                    <p className="text-muted-foreground text-sm mb-6">
                        Are you sure you want to remove this genre from the book? This action cannot be undone.
                    </p>
                    <div className="flex gap-3 justify-end">
                        <button 
                            onClick={() => setShowDeleteModal(false)}
                            className="px-4 py-2 rounded-full font-bold text-sm bg-muted text-foreground hover:bg-muted/80 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDeleteGenre}
                            className="px-4 py-2 rounded-full font-bold text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Delete Book Confirmation Modal */}
        {showDeleteBookModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-card border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                    <h3 className="text-xl font-bold mb-2 text-destructive">Delete Book?</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                        Are you sure you want to permanently delete this book?
                    </p>
                    <p className="text-foreground text-sm font-bold mb-6">
                        This will delete:
                    </p>
                    <ul className="text-sm text-muted-foreground mb-6 space-y-1 ml-4">
                        <li>• Book metadata from database</li>
                        <li>• EPUB file from storage</li>
                        <li>• Cover image</li>
                        <li>• Extracted content</li>
                    </ul>
                    <p className="text-destructive text-xs font-bold mb-6">
                        ⚠️ This action cannot be undone!
                    </p>
                    <div className="flex gap-3 justify-end">
                        <button 
                            onClick={() => setShowDeleteBookModal(false)}
                            disabled={deleting}
                            className="px-4 py-2 rounded-full font-bold text-sm bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleDeleteBook}
                            disabled={deleting}
                            className="px-4 py-2 rounded-full font-bold text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {deleting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                            {deleting ? 'Deleting...' : 'Delete Forever'}
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
