import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  Trash2,
  Calendar
} from 'lucide-react';
import { booksApi, genresApi, booksGenresApi, authorsApi, booksAuthorsApi, publishersApi, reviewsApi } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

const formatDateForInput = (dateValue) => {
  if (!dateValue) return '';
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return '';
  }
};

const StarRating = ({ rating, onRate, size = 18, interactive = true }) => {
  const [hover, setHover] = useState(0);
  
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={cn(
            "transition-all duration-200",
            interactive ? "cursor-pointer" : "cursor-default",
            (hover || rating) >= star 
              ? "text-yellow-400 fill-yellow-400" 
              : "text-muted-foreground/30 fill-none"
          )}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onRate(star)}
        />
      ))}
    </div>
  );
};

const DatePicker = ({ value, onChange }) => {
  // Parse YYYY-MM-DD string manually to avoid timezone shifts
  const parseValue = (val) => {
    if (!val) return { d: 1, m: 0, y: new Date().getFullYear() };
    const parts = val.split('-');
    if (parts.length !== 3) return { d: 1, m: 0, y: new Date().getFullYear() };
    return {
      y: parseInt(parts[0]),
      m: parseInt(parts[1]) - 1,
      d: parseInt(parts[2])
    };
  };

  const { d, m, y } = parseValue(value);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const years = Array.from({ length: 150 }, (_, i) => new Date().getFullYear() - i);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const updateDate = (newD, newM, newY) => {
    const mm = String(newM + 1).padStart(2, '0');
    const dd = String(newD).padStart(2, '0');
    // Konstrukt exact YYYY-MM-DD string
    onChange(`${newY}-${mm}-${dd}`);
  };

  return (
    <div className="flex gap-1 animate-in fade-in duration-300">
      <div className="relative group/select">
        <select 
          value={d} 
          onChange={e => updateDate(parseInt(e.target.value), m, y)}
          className="appearance-none bg-white/5 border border-white/20 hover:border-primary/50 rounded-lg pl-2 pr-6 py-1 text-[11px] font-bold text-foreground outline-none focus:border-primary transition-all cursor-pointer"
        >
          {days.map(day => <option key={day} value={day} className="bg-slate-900">{day}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>

      <div className="relative group/select">
        <select 
          value={m} 
          onChange={e => updateDate(d, parseInt(e.target.value), y)}
          className="appearance-none bg-white/5 border border-white/20 hover:border-primary/50 rounded-lg pl-2 pr-6 py-1 text-[11px] font-bold text-foreground outline-none focus:border-primary transition-all cursor-pointer"
        >
          {months.map((month, i) => <option key={month} value={i} className="bg-slate-900">{month}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>

      <div className="relative group/select">
        <select 
          value={y} 
          onChange={e => updateDate(d, m, parseInt(e.target.value))}
          className="appearance-none bg-white/5 border border-white/20 hover:border-primary/50 rounded-lg pl-2 pr-6 py-1 text-[11px] font-bold text-foreground outline-none focus:border-primary transition-all cursor-pointer"
        >
          {years.map(year => <option key={year} value={year} className="bg-slate-900">{year}</option>)}
        </select>
        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
};

export default function BookDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ book_title: '', book_summary: '', book_isbn: '', book_isbn_13: '', book_publisher_id: '', book_date: '' });
  const [saving, setSaving] = useState(false);
  
  const [allGenres, setAllGenres] = useState([]);
  const [showGenreInput, setShowGenreInput] = useState(false);
  const [selectedGenreId, setSelectedGenreId] = useState('');
  const [isCreatingGenre, setIsCreatingGenre] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');
  
  const [allAuthors, setAllAuthors] = useState([]);
  const [selectedAuthorId, setSelectedAuthorId] = useState('');
  const [allPublishers, setAllPublishers] = useState([]);
  const [currentAuthorRelationId, setCurrentAuthorRelationId] = useState(null);
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [genreToDelete, setGenreToDelete] = useState(null);
  const [showDeleteBookModal, setShowDeleteBookModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [updatingCover, setUpdatingCover] = useState(false);
  
  // Reviews State
  const [reviews, setReviews] = useState([]);
  const [isAddingReview, setIsAddingReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({ title: '', description: '' });
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchReviews = async () => {
    try {
      const res = await booksApi.getReviews(id);
      setReviews(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch reviews", err);
    }
  };

  const handleRate = async (newRating) => {
    try {
      if (!book.bookuser_id) {
          // If no relationship exists, create one first (usually happens when starting to read)
          await booksApi.updateProgress(id, {
              current_index: 0,
              progress_percentage: 0
          });
          // Refresh book to get new bookuser_id
          const newBookRes = await booksApi.getById(id);
          const newBookData = newBookRes.data.data;
          setBook(newBookData);
          
          // Now create review
          await reviewsApi.create({
              review_title: 'Rating',
              review_score: newRating,
              bookuser_ID: newBookData.bookuser_id,
              review_create_date: Date.now()
          });
      } else {
          // Check if review exists
          const reviewsRes = await booksApi.getReviews(id);
          const userReview = reviewsRes.data.data.find(r => r.bookuser_ID === book.bookuser_id);
          
          if (userReview) {
              await reviewsApi.update(userReview.ID, {
                  review_score: newRating,
                  review_update_date: Date.now()
              });
          } else {
              await reviewsApi.create({
                  review_title: 'Rating',
                  review_score: newRating,
                  bookuser_ID: book.bookuser_id,
                  review_create_date: Date.now()
              });
          }
      }
      
      // Update local state
      setBook(prev => ({ ...prev, user_rating: newRating }));
      await fetchReviews(); // Refresh review list to show updated star count
    } catch (err) {
      console.error("Failed to save rating", err);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewForm.title) return;
    setSubmittingReview(true);
    try {
      let bookuserId = book.bookuser_id;
      if (!bookuserId) {
          // Initialize progress if not exists
          await booksApi.updateProgress(id, { current_index: 0, progress_percentage: 0 });
          const updated = await booksApi.getById(id);
          bookuserId = updated.data.data.bookuser_id;
          setBook(updated.data.data);
      }

      const existingReview = reviews.find(r => r.bookuser_ID === bookuserId);
      if (existingReview) {
        await reviewsApi.update(existingReview.ID, {
          review_title: reviewForm.title,
          review_description: reviewForm.description,
          review_update_date: Date.now()
        });
      } else {
        await reviewsApi.create({
          review_title: reviewForm.title,
          review_description: reviewForm.description,
          review_score: book.user_rating || 0,
          bookuser_ID: bookuserId,
          review_create_date: Date.now()
        });
      }
      setIsAddingReview(false);
      setReviewForm({ title: '', description: '' });
      await fetchReviews();
    } catch (err) {
      console.error("Failed to submit review", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Update basic book info (title, summary, ISBN)
      const updateData = {
        book_title: editForm.book_title,
        book_summary: editForm.book_summary,
        book_isbn: editForm.book_isbn,
        book_isbn_13: editForm.book_isbn_13,
        book_date: editForm.book_date ? new Date(editForm.book_date).getTime() : null,
        book_publisher_id: (editForm.book_publisher_id && !isNaN(Number(editForm.book_publisher_id))) 
          ? Number(editForm.book_publisher_id) 
          : null,
        book_update_date: Date.now()
      };

      console.log("Saving book update:", updateData);
      await booksApi.update(id, updateData);
      
      // 2. If an author was selected in the dropdown, update the relationship
      if (selectedAuthorId) {
        // Get all BooksAuthors relationships for this book
        const allRelationsRes = await booksAuthorsApi.getAll();
        const bookRelations = allRelationsRes.data.data.filter(rel => rel.book_id == id);
        
        // Delete all existing author relationships for this book
        for (const relation of bookRelations) {
          await booksAuthorsApi.delete(relation.ID);
        }
        
        // Create new author relationship
        await booksAuthorsApi.create({ 
          book_id: parseInt(id), 
          author_id: parseInt(selectedAuthorId),
          bookauthor_create_date: Date.now()
        });
      }

      // 3. Refresh book data
      const res = await booksApi.getById(id);
      const updatedBook = res.data.data;
      setBook(updatedBook);
      setEditForm({
        book_title: updatedBook.book_title,
        book_summary: updatedBook.book_summary,
        book_isbn: updatedBook.book_isbn || '',
        book_isbn_13: updatedBook.book_isbn_13 || '',
        book_publisher_id: updatedBook.book_publisher_id,
        book_date: formatDateForInput(updatedBook.book_date)
      });
      setSelectedAuthorId('');
      setIsEditing(false);
      
      // Update the current relation ID for future changes
      if (updatedBook.authors_data && typeof updatedBook.authors_data === 'string') {
        const authorParts = updatedBook.authors_data.split('||')[0]?.split('::');
        if (authorParts && authorParts.length >= 3) {
          setCurrentAuthorRelationId(authorParts[2]);
        }
      }
    } catch (err) {
      console.error("Failed to update book", err);
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
      setDeleting(false);
    }
  };

  const handleUpdateCover = async (e) => {
    e?.preventDefault();
    if (!coverUrlInput) return;
    
    setUpdatingCover(true);
    try {
      const res = await booksApi.setCoverFromUrl(id, coverUrlInput);
      if (res.data.success) {
        // Refresh book data to see new cover
        const bookRes = await booksApi.getById(id);
        setBook(bookRes.data.data);
        setCoverUrlInput('');
      }
    } catch (err) {
      console.error("Failed to update cover", err);
    } finally {
      setUpdatingCover(false);
    }
  };



  useEffect(() => {
    const loadGenresAndAuthors = async () => {
        try {
            const [genresRes, authorsRes, publishersRes] = await Promise.all([
              genresApi.getAll(),
              authorsApi.getAll(),
              publishersApi.getAll()
            ]);
            setAllGenres(genresRes.data.data);
            setAllAuthors(authorsRes.data.data);
            setAllPublishers(publishersRes.data.data);
        } catch (err) {
            console.error("Failed to load genres/authors", err);
        }
    };
    loadGenresAndAuthors();
  }, []);

  useEffect(() => {
    const fetchBook = async () => {
      try {
        const res = await booksApi.getById(id);
        const bookData = res.data.data;
        setBook(bookData);
        setEditForm({
            book_title: bookData.book_title || '',
            book_summary: bookData.book_summary || '',
            book_isbn: bookData.book_isbn || '',
            book_isbn_13: bookData.book_isbn_13 || '',
            book_publisher_id: bookData.book_publisher_id || '',
            book_date: formatDateForInput(bookData.book_date)
        });
        
        // Extract author relationship ID for editing
        if (bookData.authors_data && typeof bookData.authors_data === 'string') {
          const authorParts = bookData.authors_data.split('||')[0]?.split('::');
          if (authorParts && authorParts.length >= 3) {
            setCurrentAuthorRelationId(authorParts[2]); 
          }
        }
      } catch (err) {
        console.error("Failed to fetch book details", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBook();
    fetchReviews();
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
          <div className="w-full max-w-[300px] shrink-0 self-center md:self-start flex flex-col gap-4">
            <div className="aspect-[2/3] rounded-lg overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group relative">
                <img src={coverUrl} alt={book.book_title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
            </div>

            {isEditing && (
              <div className="flex flex-col gap-3 p-4 bg-white/5 border border-white/10 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary">Custom Cover</label>
                <form onSubmit={handleUpdateCover} className="flex flex-col gap-2">
                  <input 
                    value={coverUrlInput}
                    onChange={e => setCoverUrlInput(e.target.value)}
                    placeholder="Paste image URL..."
                    className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs w-full outline-none focus:border-primary transition-all"
                  />
                  <div className="flex gap-2">
                    <button 
                      type="submit"
                      disabled={updatingCover || !coverUrlInput}
                      className="flex-1 bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-black uppercase tracking-tighter py-2 rounded-lg transition-all disabled:opacity-50"
                    >
                      {updatingCover ? 'Downloading...' : 'Update Cover'}
                    </button>
                    {book.book_isbn && (
                       <button 
                        type="button"
                        onClick={() => setCoverUrlInput(`https://covers.openlibrary.org/b/isbn/${book.book_isbn}-L.jpg`)}
                        className="px-3 bg-white/5 hover:bg-white/10 text-muted-foreground text-[10px] font-black uppercase py-2 rounded-lg transition-all"
                        title="Try OpenLibrary ISBN cover"
                       >
                         OL
                       </button>
                    )}
                  </div>
                </form>
                <p className="text-[9px] text-muted-foreground italic">Tip: Provide a direct URL to an image. It will be downloaded and stored locally.</p>
              </div>
            )}

            {/* Reviews Section */}
            <div className="mt-8 flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground leading-none">Reviews</h3>
                  {book.avg_rating > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star 
                            key={s} 
                            size={10} 
                            className={cn(s <= Math.round(book.avg_rating) ? "text-yellow-400 fill-yellow-400" : "text-white/10 fill-none")} 
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-black text-foreground/90">{Number(book.avg_rating).toFixed(1)}</span>
                    </div>
                  )}
                </div>
                {!isAddingReview && (hasPermission('userrole_readbooks') || hasPermission('userrole_managebooks')) && (
                  <button 
                    onClick={() => {
                      const userRev = reviews.find(r => r.bookuser_ID === book.bookuser_id);
                      if (userRev) {
                        setReviewForm({ title: userRev.review_title, description: userRev.review_description || '' });
                      } else {
                        setReviewForm({ title: '', description: '' });
                      }
                      setIsAddingReview(true);
                    }}
                    className="text-[9px] font-black uppercase text-primary hover:text-primary/80 transition-colors tracking-widest"
                  >
                    {reviews.find(r => r.bookuser_ID === book.bookuser_id) ? 'Edit My Review' : 'Add Review'}
                  </button>
                )}
              </div>

              {isAddingReview ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 animate-in slide-in-from-top-4 duration-300">
                  <input 
                    placeholder="Review Title"
                    value={reviewForm.title}
                    onChange={e => setReviewForm({...reviewForm, title: e.target.value})}
                    className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/50 transition-all shadow-inner"
                  />
                  <textarea 
                    placeholder="What did you think of the story?"
                    rows={4}
                    value={reviewForm.description}
                    onChange={e => setReviewForm({...reviewForm, description: e.target.value})}
                    className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs font-medium text-foreground outline-none focus:border-primary/50 transition-all resize-none shadow-inner"
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setIsAddingReview(false)}
                      className="px-3 py-1.5 text-[10px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSubmitReview}
                      disabled={submittingReview}
                      className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                    >
                      {submittingReview ? 'Posting...' : 'Post Review'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {reviews.length === 0 ? (
                    <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-6 text-center">
                      <p className="text-[10px] font-bold text-muted-foreground/40 italic uppercase tracking-wider">No reviews yet</p>
                    </div>
                  ) : (
                    reviews.map(review => (
                      <div key={review.ID} className="group relative bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-xl p-4 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black uppercase text-primary tracking-[0.1em]">{review.user_username}</span>
                          <div className="flex items-center gap-0.5">
                            {[1,2,3,4,5].map(s => (
                              <Star key={s} size={8} className={cn(s <= review.review_score ? "text-yellow-400 fill-yellow-400" : "text-white/10 fill-none")} />
                            ))}
                          </div>
                        </div>
                        <h4 className="text-xs font-black text-foreground mb-1 leading-tight">{review.review_title}</h4>
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic line-clamp-4 group-hover:line-clamp-none transition-all">"{review.review_description}"</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="flex-1 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                 <span className="px-2 py-0.5 bg-primary/20 text-primary text-[10px] font-black rounded uppercase tracking-wider">Book</span>
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
                    {isEditing ? (
                      <div className="flex gap-2 items-center">
                        <div className="flex items-center gap-1 opacity-60 bg-white/5 px-2 py-1 rounded border border-white/10 italic">
                           {book.authors_data && typeof book.authors_data === 'string' ? book.authors_data.split('||').map((authorStr, idx) => {
                             const parts = authorStr.split('::');
                             if (parts.length < 2) return null;
                             return <span key={parts[0]}>{parts[1]}{idx < book.authors_data.split('||').length - 1 ? ', ' : ''}</span>
                           }) : <span>Unknown Author</span>}
                        </div>
                        <ChevronRight size={14} className="text-muted-foreground mr-1" />
                        <select 
                          value={selectedAuthorId}
                          onChange={e => setSelectedAuthorId(e.target.value)}
                          className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm font-bold text-primary outline-none focus:border-primary focus:bg-white/15 transition-all"
                        >
                          <option value="">Select new author...</option>
                          {allAuthors.filter(author => {
                            // Get current author IDs from book data
                            if (!book.authors_data || typeof book.authors_data !== 'string') return true;
                            const currentAuthorIds = book.authors_data.split('||').map(authorStr => {
                              const parts = authorStr.split('::');
                              return parts.length >= 1 ? parts[0] : null;
                            }).filter(Boolean);
                            // Exclude current authors
                            return !currentAuthorIds.includes(String(author.ID));
                          }).map(author => (
                            <option key={author.ID} value={author.ID}>
                              {author.author_name} {author.author_lastname}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
                 </div>
                 <span>•</span>
                 <span>{book.language_name || 'English'}</span>
                 <span>•</span>
                 <span>{book.format_name || 'Epub'}</span>
                 <span>•</span>
                 <StarRating 
                    rating={book.user_rating} 
                    onRate={handleRate} 
                    interactive={hasPermission('userrole_readbooks') || hasPermission('userrole_managebooks')}
                  />
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
                        onClick={() => {
                          setEditForm({
                            book_title: book.book_title || '',
                            book_summary: book.book_summary || '',
                            book_isbn: book.book_isbn || '',
                            book_isbn_13: book.book_isbn_13 || '',
                            book_publisher_id: book.book_publisher_id || '',
                            book_date: formatDateForInput(book.book_date)
                          });
                          setIsEditing(true);
                        }}
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
                disabled={!hasPermission('userrole_readbooks') || !book.file_exists}
                onClick={() => {
                  if (book.format_name === 'PDF') {
                    window.open(`http://localhost:3005/books_files/${encodeURIComponent(book.book_filename)}`, '_blank');
                  } else if (book.book_entry_point) {
                    navigate(`/reader/${id}`);
                  } else {
                    console.warn('Preview not available for this book.');
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-8 py-3 rounded-full font-black text-sm uppercase tracking-wider transition-all shadow-lg active:scale-95",
                  (hasPermission('userrole_readbooks') && book.file_exists)
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20" 
                    : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
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

              <div 
                className={cn(
                  "h-12 w-12 flex items-center justify-center rounded-full bg-secondary/50 border border-white/5 transition-colors backdrop-blur-sm",
                  book.file_exists ? "text-muted-foreground hover:text-foreground cursor-pointer" : "text-muted-foreground/30 cursor-not-allowed"
                )}
                onClick={() => {
                  if (book.file_exists && book.book_filename) {
                    window.open(`http://localhost:3005/books_files/${book.book_filename}`, '_blank');
                  }
                }}
              >
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
                          <div key={relId} className="px-3 py-1 bg-[#3e9cbf] border border-[#3e9cbf]/30 rounded-md text-xs font-bold text-white flex items-center gap-2 group shadow-lg shadow-[#3e9cbf]/20">
                              <Link 
                                to={isEditing ? '#' : `/genre/${genreId}`} 
                                className={cn("hover:underline transition-all", isEditing && "cursor-default hover:no-underline")}
                              >
                                {genreTitle}
                              </Link>
                              {hasPermission('userrole_managebooks') && isEditing && (
                                  <button onClick={() => handleRemoveGenre(relId)} className="text-white/70 hover:text-white transition-colors">
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
                    {isEditing ? (
                      <div className="flex flex-col gap-2 items-start">
                        <span className="text-xs font-bold text-foreground opacity-60 bg-white/5 px-2 py-1 rounded italic">{book.publisher_name || 'Unknown'}</span>
                        <select 
                          value={editForm.book_publisher_id || ''}
                          onChange={e => setEditForm({...editForm, book_publisher_id: e.target.value})}
                          className="bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-xs font-bold text-primary outline-none focus:border-primary transition-all shadow-inner w-full"
                        >
                          <option value="">Change publisher...</option>
                          {allPublishers.filter(p => p.ID !== book.book_publisher_id).map(p => (
                            <option key={p.ID} value={p.ID}>{p.publisher_name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      book.book_publisher_id ? (
                        <Link 
                          to={`/publisher/${book.book_publisher_id}`}
                          className="text-sm font-bold text-primary hover:underline hover:text-primary/80 transition-all flex items-center gap-1.5"
                        >
                          {book.publisher_name || 'Unknown'}
                        </Link>
                      ) : (
                        <p className="text-sm font-bold text-foreground">{book.publisher_name || 'Unknown'}</p>
                      )
                    )}
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
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">ISBN 13</p>
                    {isEditing ? (
                      <input 
                        value={editForm.book_isbn_13}
                        onChange={e => setEditForm({...editForm, book_isbn_13: e.target.value})}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm font-bold text-foreground outline-none focus:border-primary focus:bg-white/15 transition-all w-full shadow-inner"
                        placeholder="000-0-00-000000-0"
                      />
                    ) : (
                      <p className="text-sm font-bold text-foreground">{book.book_isbn_13 || 'N/A'}</p>
                    )}
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Added On</p>
                    <p className="text-sm font-bold text-foreground">
                        {book.book_create_date ? new Date(book.book_create_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown'}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Published</p>
                    <div className="flex items-center gap-2">
                        {isEditing ? (
                            <DatePicker 
                                value={editForm.book_date}
                                onChange={val => setEditForm({...editForm, book_date: val})}
                            />
                        ) : (
                            <p className="text-sm font-bold text-foreground">
                                {book.book_date ? new Date(book.book_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                            </p>
                        )}
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                    <p 
                        className="text-sm font-bold" 
                        style={{ color: book.file_exists ? '#8bad0d' : '#f0194b' }}
                    >
                        {book.file_exists ? 'Available' : 'Missing File'}
                    </p>
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
