import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, ExternalLink, User, Pencil, Check } from 'lucide-react';
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

export default function AuthorDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [author, setAuthor] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ author_name: '', author_lastname: '', author_wiki: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await authorsApi.update(id, editForm);
      setAuthor(prev => ({ ...prev, ...editForm }));
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update author", err);
      alert("Failed to update author");
    } finally {
      setSaving(false);
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
            author_wiki: authorData.author_wiki || ''
        });
        setBooks(booksRes.data.data);
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
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${author.author_name}${author.author_lastname}`} 
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
               <input 
                  value={editForm.author_wiki}
                  onChange={e => setEditForm({...editForm, author_wiki: e.target.value})}
                  placeholder="Wikipedia URL"
                  className="bg-white/5 border border-white/20 rounded-md px-3 py-2 text-sm w-full max-w-md outline-none focus:border-primary transition-all"
               />
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
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-2 px-6 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-full font-bold text-sm transition-all border border-primary/30"
                    >
                      <Pencil size={18} />
                      EDIT PROFILE
                    </button>
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
            <h2 className="text-2xl font-black text-foreground tracking-tight">Books by {author.author_name}</h2>
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
      </div>
    </div>
  );
}
