import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Trash2, 
  BookMarked,
  Calendar,
  MoreVertical,
  BookOpen,
  Eye,
  EyeOff,
  Edit2,
  Check,
  X
} from 'lucide-react';
import { readlistsApi } from '../api/api';
import BookCard from '../components/BookCard';
import { cn } from "@/lib/utils";

export default function ReadlistDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [readlist, setReadlist] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const [listRes, booksRes] = await Promise.all([
        readlistsApi.getById(id),
        readlistsApi.getBooks(id)
      ]);
      setReadlist(listRes.data.data);
      setBooks(booksRes.data.data || []);
    } catch (err) {
      console.error("Failed to fetch readlist details", err);
      // If 404, valid behavior might be redirect or show error
      if (err.response && err.response.status === 404) {
          navigate('/readlists');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  useEffect(() => {
      if (readlist) {
          setEditTitle(readlist.readlist_title);
          setEditVisible(readlist.readlist_visible);
          setEditBackground(readlist.readlist_background || '');
      }
  }, [readlist]);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editVisible, setEditVisible] = useState(1);
  const [editBackground, setEditBackground] = useState('');

  const handleSaveEdit = async () => {
      try {
          await readlistsApi.update(id, {
              readlist_title: editTitle,
              readlist_visible: editVisible,
              readlist_background: editBackground
          });
          setIsEditing(false);
          fetchDetails();
      } catch (err) {
          console.error("Failed to update readlist", err);
      }
  };

  const [bookToDelete, setBookToDelete] = useState(null);

  const handleRemoveBook = (e, bookId) => {
      e.stopPropagation();
      setBookToDelete(bookId);
  };

  const executeRemoveBook = async (bookId) => {
      setRemovingId(bookId);
      try {
          await readlistsApi.removeBook(id, bookId);
          await fetchDetails();
          setBookToDelete(null);
      } catch (err) {
          console.error("Failed to remove book", err);
      } finally {
          setRemovingId(null);
      }
  };

  const handleDeleteList = async () => {
      if (!window.confirm("Are you sure you want to delete this entire readlist?")) return;
      try {
          await readlistsApi.delete(id);
          navigate('/readlists');
      } catch (err) {
          console.error("Failed to delete readlist", err);
      }
  };

  if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      );
  }

  if (!readlist) return null;

  return (
    <div className="flex-1 flex flex-col bg-background relative overflow-hidden animate-in fade-in duration-500">
        {/* Header */}
        {/* Header */}
        <div className="flex flex-col gap-6 p-8 border-b border-white/5 bg-background/50 backdrop-blur-xl z-20 sticky top-0">
            <button 
                onClick={() => navigate('/readlists')}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit group"
            >
                <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                <span className="text-sm font-bold uppercase tracking-widest">Back to Lists</span>
            </button>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div className="flex-1 w-full max-w-4xl">
                    {isEditing ? (
                        <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                            <input 
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                className="text-4xl md:text-5xl font-black tracking-tighter text-foreground bg-transparent border-b border-primary/50 focus:border-primary outline-none py-2 w-full"
                                placeholder="Readlist Title"
                                autoFocus
                            />
                            
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-lg border border-border/50">
                                    <button 
                                        onClick={() => setEditVisible(1)}
                                        className={cn("px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all", editVisible === 1 ? "bg-green-600 text-white shadow-lg" : "text-muted-foreground hover:text-foreground")}
                                    >
                                        <Eye size={14} /> Public
                                    </button>
                                    <button 
                                        onClick={() => setEditVisible(0)}
                                        className={cn("px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all", editVisible === 0 ? "bg-destructive text-destructive-foreground shadow-lg" : "text-muted-foreground hover:text-foreground")}
                                    >
                                        <EyeOff size={14} /> Private
                                    </button>
                                </div>
                                
                                <input 
                                    value={editBackground}
                                    onChange={e => setEditBackground(e.target.value)}
                                    placeholder="Background Color (Hex) or Image URL"
                                    className="flex-1 bg-secondary/30 border border-border/50 rounded-lg px-4 py-2 text-sm focus:border-primary outline-none min-w-[200px]"
                                />
                            </div>

                            <div className="flex items-center gap-3 mt-2">
                                <button 
                                    onClick={handleSaveEdit}
                                    disabled={!editTitle.trim()}
                                    className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-bold text-xs uppercase tracking-wider"
                                >
                                    <Check size={16} /> Save Changes
                                </button>
                                <button 
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditTitle(readlist.readlist_title);
                                        setEditVisible(readlist.readlist_visible);
                                        setEditBackground(readlist.readlist_background || '');
                                    }}
                                    className="flex items-center gap-2 px-6 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-all font-bold text-xs uppercase tracking-wider"
                                >
                                    <X size={16} /> Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-foreground mb-2 flex items-center gap-3">
                                <BookMarked size={40} className="text-primary" />
                                {readlist.readlist_title}
                                <button 
                                    onClick={() => setIsEditing(true)}
                                    className="opacity-0 group-hover:opacity-100 hover:text-primary transition-all p-2"
                                    title="Edit Details"
                                >
                                    <Edit2 size={24} />
                                </button>
                            </h1>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium">
                                <span className="flex items-center gap-1.5 bg-secondary/50 px-3 py-1 rounded-full">
                                    <BookOpen size={14} />
                                    {books.length} Books
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Calendar size={14} />
                                    Updated {new Date(readlist.readlist_update_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                                <span className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full border border-border/50 bg-background/50", readlist.readlist_visible === 0 ? "text-destructive" : "text-green-600 border-green-200 bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800")}>
                                    {readlist.readlist_visible === 0 ? <EyeOff size={14} /> : <Eye size={14} />}
                                    <span className="text-xs font-bold uppercase tracking-wider">{readlist.readlist_visible === 0 ? 'Private' : 'Public'}</span>
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {!isEditing && (
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-secondary/50 text-foreground rounded-lg hover:bg-secondary hover:text-primary transition-all font-bold text-xs uppercase tracking-wider"
                        >
                            <Edit2 size={16} />
                            Edit
                        </button>
                        <button 
                            onClick={handleDeleteList}
                            className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive hover:text-white transition-all font-bold text-xs uppercase tracking-wider"
                        >
                            <Trash2 size={16} />
                            Delete
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {books.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center opacity-50">
                    <BookOpen size={48} className="mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground font-medium">This list is empty.</p>
                    <button onClick={() => navigate('/')} className="mt-2 text-primary hover:underline">Browse books to add</button>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6">
                    {books.map(book => (
                        <div key={book.ID} className="relative group">
                             <BookCard 
                                id={book.ID}
                                title={book.book_title}
                                year={book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}
                                progress={book.book_progress_percentage}
                                cover={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : null}
                             />
                             {/* Remove Button Overlay */}
                             <button
                                onClick={(e) => handleRemoveBook(e, book.ID)}
                                className="absolute top-2 right-2 p-1.5 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100 hover:scale-110 transition-all shadow-lg z-10"
                                title="Remove from list"
                             >
                                 {removingId === book.ID ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
                             </button>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Delete Confirmation Modal */}
        {bookToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-card border border-border rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
                    <h3 className="text-xl font-bold mb-2">Remove Book?</h3>
                    <p className="text-muted-foreground text-sm mb-6">
                        Are you sure you want to remove this book from the readlist?
                    </p>
                    
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setBookToDelete(null)}
                            className="px-4 py-2 rounded-lg font-bold text-xs bg-muted text-foreground hover:bg-muted/80 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => executeRemoveBook(bookToDelete)}
                            disabled={removingId === bookToDelete}
                            className="px-4 py-2 rounded-lg font-bold text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-2"
                        >
                            {removingId === bookToDelete ? 'Removing...' : 'Remove'}
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
