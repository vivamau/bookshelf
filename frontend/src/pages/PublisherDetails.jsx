import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, BookOpen, ExternalLink, SlidersHorizontal } from 'lucide-react';
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
  const [publisher, setPublisher] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pubRes, booksRes] = await Promise.all([
          publishersApi.getById(id),
          publishersApi.getBooks(id)
        ]);
        setPublisher(pubRes.data.data);
        setBooks(booksRes.data.data);
      } catch (err) {
        console.error("Failed to fetch publisher details", err);
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

        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <span className="text-primary text-[10px] font-black uppercase tracking-widest">Publisher Profile</span>
                <h1 className="flex flex-col tracking-tighter leading-none">
                    <span className="text-3xl md:text-4xl font-black text-foreground uppercase">{publisher.publisher_name}</span>
                </h1>
            </div>

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
                        cover={book.book_cover_img ? `http://localhost:3005/covers/${book.book_cover_img}` : null}
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
    </div>
  );
}
