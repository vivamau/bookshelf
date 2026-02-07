import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, X, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { booksApi } from '../api/api';

export default function Reader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [spine, setSpine] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);
  const isInitialized = useRef(false);

  const iframeRef = useRef(null);
  const [internalPage, setInternalPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [htmlContent, setHtmlContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [shouldJumpToLast, setShouldJumpToLast] = useState(false);
  const [initialToRestore, setInitialToRestore] = useState(null);

  // Inject styles and calculate pages when iframe content loads
  const handleIframeLoad = () => {
    if (!iframeRef.current || !htmlContent) return;
    
    let attempts = 0;
    const maxAttempts = 15; // Increased attempts for slower loads
    
    const checkLayout = setInterval(() => {
        try {
          const iframe = iframeRef.current;
          if (!iframe) { clearInterval(checkLayout); return; }
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          
          // Wait for actual content to be present in the body
          if (!doc || !doc.body || doc.body.innerHTML.trim().length < 50) {
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(checkLayout);
                setContentLoading(false);
            }
            return;
          }

          const clientWidth = doc.documentElement.clientWidth;
          const scrollWidth = doc.documentElement.scrollWidth;
          const pages = Math.max(1, Math.ceil(scrollWidth / clientWidth));
          
          // If we calculate 1 page but it feels like there should be more (heuristic), wait a bit
          if (pages === 1 && attempts < 8 && scrollWidth < clientWidth * 1.1) {
             attempts++;
             return;
          }

          console.log(`[Reader] Layout Validated (Attempt ${attempts}):`, { scrollWidth, clientWidth, pages, initialToRestore });
          setTotalPages(pages);
          
          if (shouldJumpToLast) {
            const target = pages - 1;
            setInternalPage(target);
            doc.body.style.transform = `translateX(-${target * clientWidth}px)`;
            setShouldJumpToLast(false);
          } else if (initialToRestore !== null) {
            const targetPage = Math.min(initialToRestore, pages - 1);
            console.log("[Reader] Resume Success: Jumping to page", targetPage);
            setInternalPage(targetPage);
            doc.body.style.transform = `translateX(-${targetPage * clientWidth}px)`;
            // Clear the restoration target so normal navigation works
            setInitialToRestore(null); 
          } else {
            // Ensure we are at the right position for the current internalPage
            doc.body.style.transform = `translateX(-${internalPage * clientWidth}px)`;
          }
          
          setContentLoading(false);
          clearInterval(checkLayout);
        } catch (e) {
          console.error("Reader Pagination Error:", e);
          clearInterval(checkLayout);
          setContentLoading(false);
        }
    }, 150);
  };

  useEffect(() => {
    const fetchAndPrepareBook = async () => {
      try {
        const res = await booksApi.getById(id);
        const bookData = res.data.data;
        
        // Prepare reader FIRST before setting state that triggers content loading
        setPreparing(true);
        try {
            await booksApi.prepareReader(id);
        } catch (prepareErr) {
            console.warn("Prepare reader warning:", prepareErr);
            // We continue anyway, as it might be already prepared or not needed
        }
        setPreparing(false);

        // NOW set the state that triggers the effects
        setBook(bookData);
        
        if (bookData.book_spine) {
            const parsedSpine = JSON.parse(bookData.book_spine);
            setSpine(parsedSpine);
            
            // Set initial chapter index
            let startIdx = 0;
            if (bookData.book_current_index !== undefined && bookData.book_current_index !== null) {
                startIdx = bookData.book_current_index;
                if (bookData.book_current_page !== undefined && bookData.book_current_page !== null) {
                    console.log("[Reader] Initializing restoration target:", bookData.book_current_page);
                    setInitialToRestore(bookData.book_current_page);
                }
            } else {
                const idx = parsedSpine.indexOf(bookData.book_entry_point);
                startIdx = idx !== -1 ? idx : 0;
            }
            setCurrentIndex(startIdx);
        }

        // Signal that we are ready to start saving progress
        setTimeout(() => { isInitialized.current = true; }, 1000);
      } catch (err) {
        console.error("Failed to load/prepare book for reader", err);
        setError(err.response?.data?.error || err.message || 'Failed to prepare book');
        setPreparing(false);
      } finally {
        setLoading(false);
      }
    };
    fetchAndPrepareBook();
  }, [id]);

  // Fetch and process HTML content
  useEffect(() => {
    const loadChapter = async () => {
      if (!book || !spine || currentIndex === null || !spine[currentIndex]) return;
      
      setContentLoading(true);
      try {
        const folderName = book.book_filename?.replace(/[/\\]/g, '_').replace(/\.epub$/i, '');
        const baseUrl = `${import.meta.env.VITE_API_BASE_URL}/extracted/${folderName}/`;
        const chapterRelativeDir = spine[currentIndex].substring(0, spine[currentIndex].lastIndexOf('/') + 1);
        const fullBaseUrl = baseUrl + chapterRelativeDir;
        
        const readerUrl = `${baseUrl}${spine[currentIndex]}`;
        const response = await fetch(readerUrl, { credentials: 'include' });
        let html = await response.text();

        // Rewrite relative paths for images, css, etc. AND add crossorigin
        html = html.replace(/(src|href)="([^":]+)"/g, (match, p1, p2) => {
          if (p2.startsWith('http') || p2.startsWith('data:') || p2.startsWith('blob:')) return match;
          try {
            const absoluteUrl = new URL(p2, fullBaseUrl).href;
            // Add crossorigin attribute for resources to send cookies
            return `${ p1 }="${ absoluteUrl }" crossorigin="use-credentials"`;
          } catch(e) {
            return `${ p1 }="${ fullBaseUrl }${ p2 }" crossorigin="use-credentials"`;
          }
        });

        // Inject pagination styles directly into the HTML
        const style = `
          <style>
            html { 
              height: 100vh !important; 
              overflow: hidden !important; 
              margin: 0 !important;
              padding: 0 !important;
            }
            body {
              margin: 0 !important;
              padding: 40px 60px !important;
              height: 100vh !important;
              width: 100vw !important;
              box-sizing: border-box !important;
              column-width: calc(100vw - 120px) !important;
              column-gap: 120px !important;
              column-fill: auto !important;
              transition: transform 0.3s ease-in-out !important;
              font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
              line-height: 1.7 !important;
              color: #1a1a1a !important;
              background-color: white !important;
              font-size: 18px !important;
            }
            img { 
              max-width: 100% !important; 
              max-height: calc(100vh - 100px) !important; 
              object-fit: contain !important; 
              display: block !important; 
              margin: 20px auto !important; 
            }
            p { margin-bottom: 1.2em !important; text-align: justify !important; }
            h1, h2, h3, h4 { color: #000 !important; margin-top: 1em !important; }
          </style>
        `;
        
        if (html.includes('</head>')) {
          html = html.replace('</head>', `${ style }</head>`);
        } else {
          html = style + html;
        }

        setHtmlContent(html);
      } catch (err) {
        console.error("Failed to load chapter content", err);
        setContentLoading(false);
      }
    };

    loadChapter();
  }, [currentIndex, book, spine]);

  useEffect(() => {
    // CRITICAL: Only save progress if:
    // 1. Component is fully initialized
    // 2. We ARE NOT currently in the middle of a restoration jump (initialToRestore === null)
    // 3. We have actual content loaded
    if (isInitialized.current && initialToRestore === null && !loading && !contentLoading && currentIndex !== null && spine.length > 0) {
      console.log("[Reader] Saving Progress:", { currentIndex, internalPage });
      const progress_percentage = ((currentIndex + (internalPage / totalPages)) / spine.length) * 100;
      booksApi.updateProgress(id, { 
        current_index: currentIndex, 
        current_page: internalPage,
        progress_percentage: Math.min(100, progress_percentage) 
      }).catch(err => console.error("Failed to save progress", err));
    }
  }, [currentIndex, internalPage, totalPages, loading, contentLoading, initialToRestore, spine.length, id]);

  const updateInternalPage = (newPage) => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
    const clientWidth = doc.documentElement.clientWidth;
    doc.body.style.transform = `translateX(-${newPage * clientWidth}px)`;
    setInternalPage(newPage);
  };

  const goToNext = useCallback(() => {
    if (internalPage < totalPages - 1) {
      updateInternalPage(internalPage + 1);
    } else if (currentIndex !== null && currentIndex < spine.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setInternalPage(0);
    }
  }, [currentIndex, internalPage, totalPages, spine.length]);

  const goToPrev = useCallback(() => {
    if (internalPage > 0) {
      updateInternalPage(internalPage - 1);
    } else if (currentIndex !== null && currentIndex > 0) {
      setShouldJumpToLast(true);
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex, internalPage]);

  if (loading || preparing || currentIndex === null) {
    return (
      <div className="h-screen w-full bg-[#001e38] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#f1184c] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-white/70 text-sm">
          {preparing ? 'Preparing book for reading...' : 'Loading...'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-full bg-[#001e38] flex flex-col items-center justify-center text-white p-8 text-center">
         <X size={64} className="text-[#f1184c] mb-4" />
         <h2 className="text-2xl font-bold mb-2">Failed to Load Book</h2>
         <p className="text-muted-foreground mb-6 max-w-md">{error}</p>
         <button onClick={() => navigate(`/book/${id}`)} className="px-6 py-2 bg-[#f1184c] rounded-full font-bold">Return to Details</button>
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

  return (
    <div className="h-screen w-full bg-[#0a0a0a] flex flex-col overflow-hidden animate-in fade-in duration-500 font-sans">
      <div className="h-14 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/book/${id}`)} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] leading-none mb-1">
              CH {currentIndex + 1}/{spine.length} • SCR {internalPage + 1}/{totalPages}
            </span>
            <span className="text-sm font-bold text-white leading-none truncate max-w-[200px] md:max-w-md">{book.book_title}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center bg-white/5 rounded-full px-1.5 py-1 border border-white/10">
                <button 
                    disabled={currentIndex === 0 && internalPage === 0}
                    onClick={goToPrev}
                    className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button 
                    disabled={currentIndex === spine.length - 1 && internalPage === totalPages - 1}
                    onClick={goToNext}
                    className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            <button onClick={() => { setInternalPage(0); setCurrentIndex(0); }} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white hidden md:block" title="Reset to start">
                <RotateCcw size={18} />
            </button>
            <button 
                onClick={() => navigate(`/book/${id}`)}
                className="flex items-center gap-2 px-5 py-1.5 bg-[#f1184c] hover:bg-[#d11440] text-white rounded-lg text-sm font-black tracking-wider transition-all shadow-lg shadow-[#f1184c]/20"
            >
                <X size={16} />
                <span>EXIT</span>
            </button>
        </div>
      </div>

      <div className="flex-1 bg-[#121212] relative flex justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl h-full shadow-2xl relative rounded-xl overflow-hidden bg-white">
            {contentLoading && (
                <div className="absolute inset-0 bg-white z-20 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Loading Chapter...</span>
                    </div>
                </div>
            )}
            <iframe 
                ref={iframeRef}
                onLoad={handleIframeLoad}
                srcDoc={htmlContent} 
                className="w-full h-full border-none shadow-inner"
                title={book.book_title}
            />
            
            <div 
                onClick={goToPrev}
                className={`absolute inset-y-0 left-0 w-32 cursor-pointer z-10 flex items-center justify-start pl-4 group ${currentIndex === 0 && internalPage === 0 ? 'hidden' : ''}`}
            >
                <div className="w-12 h-12 rounded-full bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-all">
                    <ChevronLeft size={24} className="text-black/0 group-hover:text-black/30" />
                </div>
            </div>

            <div 
                onClick={goToNext}
                className={`absolute inset-y-0 right-0 w-32 cursor-pointer z-10 flex items-center justify-end pr-4 group ${currentIndex === spine.length - 1 && internalPage === totalPages - 1 ? 'hidden' : ''}`}
            >
                <div className="w-12 h-12 rounded-full bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-all">
                    <ChevronRight size={24} className="text-black/0 group-hover:text-black/30" />
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
