import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Maximize2, RotateCcw, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { booksApi } from '../api/api';

export default function Reader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [spine, setSpine] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const isInitialized = React.useRef(false);

  useEffect(() => {
    const fetchBook = async () => {
      try {
        const res = await booksApi.getById(id);
        const bookData = res.data.data;
        console.log("Reader loaded book data:", bookData);
        setBook(bookData);
        
        if (bookData.book_spine) {
            const parsedSpine = JSON.parse(bookData.book_spine);
            setSpine(parsedSpine);
            
            // Initialize from saved progress if available
            if (bookData.book_current_index !== undefined && bookData.book_current_index !== null) {
                console.log("Setting initial index from DB:", bookData.book_current_index);
                setCurrentIndex(bookData.book_current_index);
            } else {
                // Try to find current index if entry point is set
                const idx = parsedSpine.indexOf(bookData.book_entry_point);
                setCurrentIndex(idx !== -1 ? idx : 0);
            }
        }
        // Mark as initialized after a short delay to bridge the state update
        setTimeout(() => { isInitialized.current = true; }, 300);
      } catch (err) {
        console.error("Failed to load book for reader", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBook();
  }, [id]);

  // Save progress when index changes
  useEffect(() => {
    if (!loading && spine.length > 0 && isInitialized.current && currentIndex !== null) {
      console.log("Saving progress to DB. Index:", currentIndex);
      const progress_percentage = ((currentIndex + 1) / spine.length) * 100;
      booksApi.updateProgress(id, { 
        current_index: currentIndex, 
        progress_percentage: progress_percentage 
      }).catch(err => console.error("Failed to save progress", err));
    }
  }, [currentIndex, loading, spine.length, id]);

  const goToNext = useCallback(() => {
    if (currentIndex !== null && currentIndex < spine.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, spine.length]);

  const goToPrev = useCallback(() => {
    if (currentIndex !== null && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  if (loading || currentIndex === null) {
    return (
      <div className="h-screen w-full bg-[#001e38] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#f1184c] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!book || spine.length === 0) {
    return (
      <div className="h-screen w-full bg-[#001e38] flex flex-col items-center justify-center text-white p-8 text-center">
         <X size={64} className="text-[#f1184c] mb-4" />
         <h2 className="text-2xl font-bold mb-2">Preview Not Available</h2>
         <p className="text-muted-foreground mb-6">This book is currently being processed or the format is not supported for browser preview.</p>
         <button onClick={() => navigate(`/book/${id}`)} className="px-6 py-2 bg-[#f1184c] rounded-full font-bold">Return to Details</button>
      </div>
    );
  }

  // Compute folder name using same logic as backend
  const folderName = book?.book_filename?.replace(/[/\\]/g, '_').replace(/\.epub$/i, '');
  const readerUrl = `http://localhost:3005/extracted/${folderName}/${spine[currentIndex]}`;

  return (
    <div className="h-screen w-full bg-[#0a0a0a] flex flex-col overflow-hidden animate-in fade-in duration-500">
      {/* Reader Controls Header */}
      <div className="h-14 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/book/${id}`)} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white/50 uppercase tracking-widest leading-none mb-1">Page {currentIndex + 1} of {spine.length}</span>
            <span className="text-sm font-bold text-white leading-none truncate max-w-[200px] md:max-w-md">{book.book_title}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center bg-white/5 rounded-full px-2 py-1">
                <button 
                    disabled={currentIndex === 0}
                    onClick={goToPrev}
                    className="p-1.5 hover:bg-white/10 rounded-full text-white/70 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button 
                    disabled={currentIndex === spine.length - 1}
                    onClick={goToNext}
                    className="p-1.5 hover:bg-white/10 rounded-full text-white/70 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            <button onClick={() => setCurrentIndex(0)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white hidden md:block" title="Reset to start">
                <RotateCcw size={18} />
            </button>
            <button 
                onClick={() => navigate(`/book/${id}`)}
                className="flex items-center gap-2 px-4 py-1.5 bg-[#f1184c] hover:bg-[#d11440] text-white rounded-md text-sm font-bold transition-all ml-2"
            >
                <X size={16} />
                <span>EXIT</span>
            </button>
        </div>
      </div>

      {/* Reader Content Area */}
      <div className="flex-1 bg-white relative flex justify-center">
        <div className="w-full max-w-4xl h-full shadow-2xl relative">
            <iframe 
                src={readerUrl} 
                className="w-full h-full border-none bg-white"
                title={book.book_title}
            />
            
            {/* Clickable Navigation Overlays */}
            <div 
                onClick={goToPrev}
                className={`absolute inset-y-0 left-0 w-32 cursor-pointer z-10 flex items-center justify-start pl-8 group ${currentIndex === 0 ? 'hidden' : ''}`}
            >
                <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronLeft size={32} className="text-black" />
                </div>
            </div>

            <div 
                onClick={goToNext}
                className={`absolute inset-y-0 right-0 w-32 cursor-pointer z-10 flex items-center justify-end pr-8 group ${currentIndex === spine.length - 1 ? 'hidden' : ''}`}
            >
                <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight size={32} className="text-black" />
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
