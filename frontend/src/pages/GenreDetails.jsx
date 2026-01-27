import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Layers } from 'lucide-react';
import { genresApi } from '../api/api';
import { cn } from '../lib/utils';

const BookItem = ({ id, title, year, cover, progress }) => {
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(`/book/${id}`)} className="flex flex-col gap-2 group cursor-pointer animate-in fade-in zoom-in duration-500">
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-accent/50 border border-border group-hover:border-[#3e9cbf]/50 transition-all shadow-md group-hover:shadow-[0_0_15px_rgba(62,156,191,0.3)]">
        <img 
          src={cover ? `${import.meta.env.VITE_API_BASE_URL}/covers/${cover}` : `https://api.dicebear.com/7.x/initials/svg?seed=${title}`} 
          alt={title} 
          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" 
        />
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

export default function GenreDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [genre, setGenre] = useState(null);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [genreRes, booksRes] = await Promise.all([
          genresApi.getById(id),
          genresApi.getBooks(id)
        ]);
        setGenre(genreRes.data.data);
        setBooks(booksRes.data.data);
      } catch (err) {
        console.error("Failed to fetch genre data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!genre) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <h2 className="text-2xl font-bold">Genre not found</h2>
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-full font-bold"
        >
          <ArrowLeft size={18} />
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-background">
      {/* Background Decoration */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#3e9cbf]/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
      
      {/* Header */}
      <div className="relative z-10 px-8 md:px-12 pt-8 pb-6 flex items-center justify-between border-b border-white/5 bg-background/95 backdrop-blur">
          <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-muted-foreground hover:text-foreground"
              >
                  <ArrowLeft size={20} />
              </button>
              <div className="flex flex-col">
                  <span className="text-xs font-black uppercase tracking-widest text-[#3e9cbf] mb-1">Genre Profile</span>
                  <h1 className="text-3xl font-black text-foreground uppercase tracking-tighter leading-none">
                      {genre.genere_title}
                  </h1>
              </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-2 bg-[#3e9cbf]/10 border border-[#3e9cbf]/20 rounded-xl">
              <BookOpen size={20} className="text-[#3e9cbf]" />
              <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none">Library Size</span>
                  <span className="text-lg font-black text-foreground leading-none">{books.length} Books</span>
              </div>
          </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-12 custom-scrollbar relative z-10">
          <div className="max-w-7xl mx-auto">
              {books.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-10">
                      {books.map(book => (
                          <BookItem 
                            key={book.ID}
                            id={book.ID}
                            title={book.book_title}
                            year={book.book_date}
                            cover={book.book_cover_img}
                            progress={book.book_progress_percentage}
                          />
                      ))}
                  </div>
              ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                      <div className="w-20 h-20 bg-muted/20 rounded-full flex items-center justify-center mb-6">
                        <Layers size={40} className="text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">No books found in this genre</h3>
                      <p className="text-muted-foreground max-w-md mx-auto px-6">
                          There are currently no books categorized under <span className="text-[#3e9cbf] font-bold">{genre.genere_title}</span> in our collection.
                      </p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
}
