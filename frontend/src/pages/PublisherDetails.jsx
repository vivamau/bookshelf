import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, BookOpen, ExternalLink, SlidersHorizontal, Pencil, Check, Trash2, Globe } from 'lucide-react';
import { publishersApi } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

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

export default function PublisherDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [publisher, setPublisher] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ publisher_name: '', publisher_website: '' });
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pubRes, booksRes] = await Promise.all([
          publishersApi.getById(id),
          publishersApi.getBooks(id)
        ]);
        const pubData = pubRes.data.data;
        setPublisher(pubData);
        setEditForm({
          publisher_name: pubData.publisher_name,
          publisher_website: pubData.publisher_website || ''
        });
        setBooks(booksRes.data.data);
      } catch (err) {
        console.error("Failed to fetch publisher details", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { 
        ...editForm, 
        publisher_update_date: Date.now() 
      };
      await publishersApi.update(id, payload);
      setPublisher(prev => ({ ...prev, ...editForm }));
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update publisher", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePublisher = async () => {
    setDeleting(true);
    try {
      await publishersApi.delete(id);
      setShowDeleteModal(false);
      navigate('/');
    } catch (err) {
      console.error("Failed to delete publisher", err);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!publisher) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
        <Building2 size={64} className="mb-4 opacity-20" />
        <h2 className="text-2xl font-bold">Publisher not found</h2>
        <button onClick={() => navigate('/publishers')} className="mt-4 text-primary font-bold hover:underline">Return to Publishers</button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background p-8 md:p-12 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 group w-fit"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-bold uppercase tracking-widest">Back</span>
      </button>

      <div className="flex flex-col md:flex-row gap-12 items-start mb-16">
        <div className="w-40 h-40 bg-secondary rounded-2xl flex items-center justify-center shrink-0 border-4 border-white/5 overflow-hidden shadow-xl shadow-black/20">
            <Building2 size={80} className="text-primary/40" />
        </div>

        <div className="flex flex-col gap-4 w-full max-w-2xl">
            <div className="flex flex-col gap-1">
                <span className="text-primary text-[10px] font-black uppercase tracking-widest">Publisher Profile</span>
                {isEditing ? (
                  <div className="flex flex-col gap-4 mt-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Publisher Name</label>
                      <input 
                        value={editForm.publisher_name}
                        onChange={e => setEditForm({...editForm, publisher_name: e.target.value})}
                        className="text-3xl md:text-4xl font-black text-foreground uppercase bg-white/5 border-b border-primary outline-none w-full py-1"
                        placeholder="Publisher Name"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Website URL</label>
                      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-3 py-2">
                        <Globe size={16} className="text-muted-foreground" />
                        <input 
                          value={editForm.publisher_website}
                          onChange={e => setEditForm({...editForm, publisher_website: e.target.value})}
                          className="bg-transparent border-none outline-none w-full text-sm font-bold text-foreground"
                          placeholder="https://example.com"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <h1 className="flex flex-col tracking-tighter leading-none">
                      <span className="text-3xl md:text-4xl font-black text-foreground uppercase">{publisher.publisher_name}</span>
                  </h1>
                )}
            </div>

            {!isEditing && publisher.publisher_website && (
              <a 
                href={publisher.publisher_website.startsWith('http') ? publisher.publisher_website : `https://${publisher.publisher_website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors text-sm font-bold w-fit mt-1"
              >
                <Globe size={16} />
                <span>Visit Official Website</span>
                <ExternalLink size={14} />
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
                         SAVE CHANGES
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
                        EDIT PUBLISHER
                      </button>
                      <button 
                        onClick={() => setShowDeleteModal(true)}
                        className="flex items-center gap-2 px-6 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-full font-bold text-sm transition-all border border-primary/30"
                      >
                        <Trash2 size={18} />
                        DELETE
                      </button>
                    </div>
                  )}
              </div>
            )}

            <div className="flex items-center gap-8 mt-4 pt-8 border-t border-white/5">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">In Library</p>
                    <p className="text-2xl font-black text-foreground">{books.length} Books</p>
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Average Completion</p>
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
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-foreground tracking-tight uppercase">Catalogue in Bookshelf</h2>
                <div className="h-px w-32 bg-primary/20" />
            </div>
            <SlidersHorizontal size={20} className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors" />
        </div>
        
        {books.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6 pb-20">
                {books.map((book) => (
                    <BookItem 
                        key={book.ID}
                        id={book.ID}
                        title={book.book_title}
                        year={book.book_date}
                        cover={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : null}
                        progress={book.book_progress_percentage}
                    />
                ))}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10 text-center">
                <BookOpen size={48} className="mb-4 opacity-20" />
                <p className="text-muted-foreground">No books found for this publisher in your collection.</p>
            </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-card border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                  {books.length > 0 ? (
                      <>
                          <h3 className="text-xl font-bold mb-2 text-red-500">Cannot Delete Publisher</h3>
                          <p className="text-muted-foreground text-sm mb-4">
                              This publisher cannot be deleted because they have {books.length} book{books.length > 1 ? 's' : ''} in your library.
                          </p>
                          <p className="text-foreground text-sm font-bold mb-6">
                              Please delete or reassign all books from this publisher before removing them.
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
                          <h3 className="text-xl font-bold mb-2 text-red-500">Delete Publisher?</h3>
                          <p className="text-muted-foreground text-sm mb-4">
                              Are you sure you want to permanently delete <strong>{publisher.publisher_name}</strong>?
                          </p>
                          <p className="text-foreground text-sm font-bold mb-4">
                              This will remove the publisher footprint from your library.
                          </p>
                          <p className="text-red-500 text-xs font-bold mb-6">
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
                                  onClick={handleDeletePublisher}
                                  disabled={deleting}
                                  className="px-4 py-2 rounded-full font-bold text-sm bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
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
  );
}
