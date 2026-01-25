import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, ExternalLink, User, Pencil, Check, Trash2 } from 'lucide-react';
import { authorsApi } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

// Reusing BookCard-like logic or direct implementation
const BookItem = ({ id, title, year, cover, progress }) => {
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(`/book/${id}`)} className="flex flex-col gap-2 group cursor-pointer animate-in fade-in zoom-in duration-500">
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-accent/50 border border-border group-hover:border-primary/50 transition-all shadow-md group-hover:shadow-[0_0_15px_rgba(241,24,76,0.3)]">
        <img src={cover || `https://api.dicebear.com/7.x/initials/svg?seed=${title}`} alt={title} className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" />
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{title}</span>
        <span className="text-xs text-muted-foreground">{year ? new Date(year).getFullYear() : 'N/A'}</span>
      </div>
    </div>
  );
};

const OtherBookItem = ({ title, year, cover, olKey }) => {
  return (
    <a 
      href={`https://openlibrary.org${olKey}`} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="flex flex-col gap-2 group cursor-pointer animate-in fade-in zoom-in duration-500"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-accent/30 border border-border group-hover:border-primary/30 transition-all shadow-sm">
        <img 
          src={cover ? `https://covers.openlibrary.org/b/id/${cover}-M.jpg` : `https://api.dicebear.com/7.x/initials/svg?seed=${title}`} 
          alt={title} 
          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" 
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
           <div className="bg-primary/20 p-2 rounded-full text-primary transform scale-50 group-hover:scale-100 transition-all duration-300">
              <ExternalLink size={20} />
           </div>
        </div>
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="text-[12px] font-bold truncate group-hover:text-primary transition-colors leading-tight mb-1">{title}</span>
        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{year || 'N/A'}</span>
      </div>
    </a>
  );
};

export default function AuthorDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [author, setAuthor] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ author_name: '', author_lastname: '', author_wiki: '', author_avatar: '' });
  const [saving, setSaving] = useState(false);
  const [avatarMode, setAvatarMode] = useState('dicebear'); // 'dicebear' or 'custom'
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [otherBooks, setOtherBooks] = useState([]);
  const [loadingOtherBooks, setLoadingOtherBooks] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await authorsApi.update(id, editForm);
      setAuthor(prev => ({ ...prev, ...editForm }));
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update author", err);
    } finally {
      setSaving(false);
    }
  };

  const fetchOtherBooks = async (name, lastname, systemBooks) => {
    setLoadingOtherBooks(true);
    try {
        const query = encodeURIComponent(`${name} ${lastname}`);
        const res = await fetch(`https://openlibrary.org/search.json?author=${query}&sort=new`);
        const data = await res.json();
        
        // Filter out existing books by title (case insensitive)
        const systemTitles = systemBooks.map(b => b.book_title.toLowerCase());
        const filtered = data.docs
          .filter(doc => !systemTitles.includes(doc.title.toLowerCase()))
          .slice(0, 16); 
        
        setOtherBooks(filtered);
    } catch (err) {
        console.error("Failed to fetch from Open Library", err);
    } finally {
        setLoadingOtherBooks(false);
    }
  };

  const handleDeleteAuthor = async () => {
    setDeleting(true);
    try {
      await authorsApi.delete(id);
      setShowDeleteModal(false);
      // Navigate back to home after successful deletion
      navigate('/');
    } catch (err) {
      console.error("Failed to delete author", err);
      setDeleting(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [authorRes, booksRes] = await Promise.all([
          authorsApi.getById(id),
          authorsApi.getBooks(id)
        ]);
        const authorData = authorRes.data.data;
        setAuthor(authorData);
        setEditForm({
            author_name: authorData.author_name,
            author_lastname: authorData.author_lastname,
            author_wiki: authorData.author_wiki || '',
            author_avatar: authorData.author_avatar || ''
        });
        // Determine initial avatar mode
        if (authorData.author_avatar && !authorData.author_avatar.includes('dicebear.com')) {
            setAvatarMode('custom');
        }
        setBooks(booksRes.data.data);
        
        // Fetch other books from Open Library
        fetchOtherBooks(authorData.author_name, authorData.author_lastname, booksRes.data.data);
      } catch (err) {
        console.error("Failed to fetch author logic", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!author) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
        <User size={64} className="mb-4 opacity-20" />
        <h2 className="text-2xl font-bold">Author not found</h2>
        <button onClick={() => navigate('/')} className="mt-4 text-primary font-bold hover:underline">Return Home</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background p-8 md:p-12 overflow-y-auto">
      {/* Header */}
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 group w-fit"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-bold uppercase tracking-widest">Back</span>
      </button>

      <div className="flex flex-col md:flex-row gap-12 items-start mb-16">
        <div className="w-40 h-40 bg-secondary rounded-full flex items-center justify-center shrink-0 border-4 border-white/5 overflow-hidden">
            <img 
                src={author.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author.author_name}${author.author_lastname}`} 
                alt={author.author_name} 
                className="w-full h-full object-cover"
            />
        </div>

        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <span className="text-primary text-[10px] font-black uppercase tracking-widest">Author Profile</span>
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <input 
                      value={editForm.author_name}
                      onChange={e => setEditForm({...editForm, author_name: e.target.value})}
                      placeholder="First Name"
                      className="text-3xl md:text-4xl font-medium text-muted-foreground bg-white/5 border-b border-white/20 outline-none w-full"
                    />
                    <input 
                      value={editForm.author_lastname}
                      onChange={e => setEditForm({...editForm, author_lastname: e.target.value})}
                      placeholder="Last Name"
                      className="text-6xl md:text-8xl font-black text-foreground uppercase bg-white/5 border-b border-primary outline-none w-full"
                    />
                  </div>
                ) : (
                  <h1 className="flex flex-col tracking-tighter leading-none">
                      <span className="text-3xl md:text-4xl font-medium text-muted-foreground capitalize">{author.author_name}</span>
                      <span className="text-6xl md:text-8xl font-black text-foreground uppercase">{author.author_lastname}</span>
                  </h1>
                )}
            </div>

            {hasPermission('userrole_managebooks') && isEditing && (
               <div className="flex flex-col gap-4 w-full max-w-md">
                  <input 
                     value={editForm.author_wiki}
                     onChange={e => setEditForm({...editForm, author_wiki: e.target.value})}
                     placeholder="Wikipedia URL"
                     className="bg-white/5 border border-white/20 rounded-md px-3 py-2 text-sm w-full outline-none focus:border-primary transition-all"
                  />
                  
                  {/* Avatar Selection */}
                  <div className="flex flex-col gap-2 p-4 bg-white/5 border border-white/10 rounded-lg">
                     <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Avatar</label>
                     
                     <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                           <input 
                              type="radio" 
                              name="avatarMode" 
                              value="dicebear"
                              checked={avatarMode === 'dicebear'}
                              onChange={(e) => {
                                 setAvatarMode('dicebear');
                                 setEditForm({...editForm, author_avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${editForm.author_name}${editForm.author_lastname}`});
                              }}
                              className="accent-primary"
                           />
                           <span className="text-sm text-foreground">Dicebear</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                           <input 
                              type="radio" 
                              name="avatarMode" 
                              value="custom"
                              checked={avatarMode === 'custom'}
                              onChange={(e) => setAvatarMode('custom')}
                              className="accent-primary"
                           />
                           <span className="text-sm text-foreground">Custom URL</span>
                        </label>
                     </div>
                     
                     {avatarMode === 'custom' && (
                        <input 
                           value={editForm.author_avatar}
                           onChange={e => setEditForm({...editForm, author_avatar: e.target.value})}
                           placeholder="https://example.com/avatar.jpg"
                           className="bg-white/5 border border-white/20 rounded-md px-3 py-2 text-sm w-full outline-none focus:border-primary transition-all mt-2"
                        />
                     )}
                     
                     {avatarMode === 'dicebear' && (
                        <p className="text-xs text-muted-foreground mt-2">Using auto-generated avatar based on author name</p>
                     )}
                  </div>
               </div>
            )}

            {!isEditing && author.author_wiki && (
                <a 
                    href={author.author_wiki} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full text-muted-foreground hover:text-primary hover:bg-white/10 transition-all text-sm font-bold w-fit mt-2"
                >
                    <ExternalLink size={16} />
                    <span>Explore Wikipedia Biography</span>
                </a>
            )}

            {/* Edit Controls */}
            {hasPermission('userrole_managebooks') && (
              <div className="mt-4">
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
                        EDIT PROFILE
                      </button>
                      <button 
                        onClick={() => setShowDeleteModal(true)}
                        className="flex items-center gap-2 px-6 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-full font-bold text-sm transition-all border border-primary/30"
                      >
                        <Trash2 size={18} />
                        DELETE AUTHOR
                      </button>
                    </div>
                  )}
              </div>
            )}

            <div className="flex items-center gap-8 mt-4 pt-8 border-t border-white/5">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Books</p>
                    <p className="text-2xl font-black text-foreground">{books.length}</p>
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Average Progress</p>
                    <p className="text-2xl font-black text-primary">
                        {books.length > 0 
                          ? `${Math.round(books.reduce((acc, b) => acc + (b.book_progress_percentage || 0), 0) / books.length)}%`
                          : '0%'
                        }
                    </p>
                </div>
            </div>
        </div>
      </div>

      {/* Books Grid */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-foreground tracking-tight uppercase">{author?.author_name} {author?.author_lastname}'s books in bookshelf</h2>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6">
            {books.map((book) => (
                <BookItem 
                    key={book.ID}
                    id={book.ID}
                    title={book.book_title}
                    year={book.book_date}
                    cover={book.book_cover_img ? `http://localhost:3005/covers/${book.book_cover_img}` : null}
                    progress={book.book_progress_percentage}
                />
            ))}
        </div>

        {/* Otherbooks from Open Library */}
        <div className="pt-10 border-t border-white/5 pb-20">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-foreground uppercase">Otherbooks</h2>
                    <p className="text-xs text-muted-foreground font-medium mt-1">Discover more works by {author?.author_name} {author?.author_lastname} from Open Library.</p>
                </div>
                <div className="h-px flex-1 mx-8 bg-gradient-to-r from-white/5 to-transparent hidden md:block" />
            </div>

            {loadingOtherBooks ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6 opacity-50 animate-pulse">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="flex flex-col gap-2">
                             <div className="aspect-[2/3] bg-card rounded-sm border border-border" />
                             <div className="h-3 w-3/4 bg-card rounded mt-1" />
                             <div className="h-2 w-1/4 bg-card rounded" />
                        </div>
                    ))}
                </div>
            ) : otherBooks.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6">
                    {otherBooks.map((doc, idx) => (
                        <OtherBookItem 
                            key={idx}
                            title={doc.title}
                            year={doc.first_publish_year}
                            cover={doc.cover_i}
                            olKey={doc.key}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-12 px-4 bg-white/5 rounded-xl border border-white/5 text-center">
                    <p className="text-sm text-muted-foreground">No other books found in Open Library for this author.</p>
                </div>
            )}
        </div>

        {/* Delete Author Confirmation Modal */}
        {showDeleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-card border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                    {books.length > 0 ? (
                        <>
                            <h3 className="text-xl font-bold mb-2 text-destructive">Cannot Delete Author</h3>
                            <p className="text-muted-foreground text-sm mb-4">
                                This author cannot be deleted because they have {books.length} book{books.length > 1 ? 's' : ''} in your library.
                            </p>
                            <p className="text-foreground text-sm font-bold mb-6">
                                Please delete or reassign all books by this author before deleting the author profile.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button 
                                    onClick={() => setShowDeleteModal(false)}
                                    className="px-4 py-2 rounded-full font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                >
                                    OK
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <h3 className="text-xl font-bold mb-2 text-destructive">Delete Author?</h3>
                            <p className="text-muted-foreground text-sm mb-4">
                                Are you sure you want to permanently delete this author?
                            </p>
                            <p className="text-foreground text-sm font-bold mb-4">
                                This will remove the author from the database.
                            </p>
                            <p className="text-destructive text-xs font-bold mb-6">
                                ⚠️ This action cannot be undone!
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button 
                                    onClick={() => setShowDeleteModal(false)}
                                    disabled={deleting}
                                    className="px-4 py-2 rounded-full font-bold text-sm bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleDeleteAuthor}
                                    disabled={deleting}
                                    className="px-4 py-2 rounded-full font-bold text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {deleting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                    {deleting ? 'Deleting...' : 'Delete Forever'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
}
