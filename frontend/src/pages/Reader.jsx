import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, X, RotateCcw, ChevronLeft, ChevronRight, Maximize2, Minimize2, Type, Sun, Moon, BookOpen } from 'lucide-react';
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

  // Reader Mode
  const [isComic, setIsComic] = useState(false);
  const [fitMode, setFitMode] = useState('contain'); // 'contain' | 'width'
  const [fontFamily, setFontFamily] = useState('sans'); // 'sans' | 'serif' | 'mono'
  const fontRef = useRef('sans'); // To access in loadChapter without dependency
  const [fontSize, setFontSize] = useState(18);
  const fontSizeRef = useRef(18);

  const [theme, setTheme] = useState('light'); // 'light' | 'dark'
  const themeRef = useRef('light');
  const [showFontMenu, setShowFontMenu] = useState(false);

  useEffect(() => { 
      fontRef.current = fontFamily; 
      fontSizeRef.current = fontSize;
      themeRef.current = theme;
  }, [fontFamily, fontSize, theme]);

  const themes = {
      light: { bg: '#ffffff', text: '#1a1a1a' },
      dark: { bg: '#1a1a1a', text: '#e0e0e0' },
      sepia: { bg: '#f4ecd8', text: '#5b4636' }
  };

  const fontInternalNames = {
      sans: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      serif: "'Georgia', 'Times New Roman', serif",
      mono: "'Menlo', 'Consolas', 'Monaco', 'Courier New', monospace"
  };

  // EPUB Specific
  const iframeRef = useRef(null);
  const [internalPage, setInternalPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [htmlContent, setHtmlContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [shouldJumpToLast, setShouldJumpToLast] = useState(false);
  const [initialToRestore, setInitialToRestore] = useState(null);

  // Comic Specific
  const [comicImageLoading, setComicImageLoading] = useState(false);

  // Inject styles and calculate pages when iframe content loads (EPUB only)
  const handleIframeLoad = () => {
    if (!iframeRef.current || !htmlContent || isComic) return;
    
    let attempts = 0;
    const maxAttempts = 15;
    
    const checkLayout = setInterval(() => {
        try {
          const iframe = iframeRef.current;
          if (!iframe) { clearInterval(checkLayout); return; }
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          
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
            setInternalPage(targetPage);
            doc.body.style.transform = `translateX(-${targetPage * clientWidth}px)`;
            setInitialToRestore(null); 
          } else {
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
        
        // Detect format
        const lowerName = bookData.book_filename?.toLowerCase() || '';
        const isComicFormat = lowerName.endsWith('.cbz') || lowerName.endsWith('.cbr') || lowerName.endsWith('.zip') || lowerName.endsWith('.rar');
        setIsComic(isComicFormat);

        // Prepare reader FIRST
        setPreparing(true);
        try {
            await booksApi.prepareReader(id);
        } catch (prepareErr) {
            console.warn("Prepare reader warning:", prepareErr);
        }
        setPreparing(false);

        setBook(bookData);
        
        if (bookData.book_spine) {
            const parsedSpine = JSON.parse(bookData.book_spine);
            setSpine(parsedSpine);
            
            let startIdx = 0;
            if (bookData.book_current_index !== undefined && bookData.book_current_index !== null) {
                startIdx = bookData.book_current_index;
                if (!isComicFormat && bookData.book_current_page !== undefined && bookData.book_current_page !== null) {
                    setInitialToRestore(bookData.book_current_page);
                }
            } else {
                if (!isComicFormat) {
                    const idx = parsedSpine.indexOf(bookData.book_entry_point);
                    startIdx = idx !== -1 ? idx : 0;
                } else {
                    startIdx = 0;
                }
            }
            setCurrentIndex(startIdx);
        }

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

  // Load Content (EPUB) or Image (Comic)
  useEffect(() => {
    if (!book || !spine || currentIndex === null || !spine[currentIndex]) return;
    
    // --- COMIC LOGIC ---
    if (isComic) {
        setComicImageLoading(true);
        // Preload next image
        if (currentIndex < spine.length - 1) {
            const nextImg = new Image();
            nextImg.src = `${import.meta.env.VITE_API_BASE_URL}/api/books/${id}/pages?file=${encodeURIComponent(spine[currentIndex + 1])}`;
        }
        // Current image loading is handled by the <img> onLoad
        return;
    }

    // --- EPUB LOGIC ---
    const loadChapter = async () => {
      setContentLoading(true);
      try {
        const folderName = book.book_filename?.replace(/[/\\]/g, '_').replace(/\.epub$/i, '');
        const baseUrl = `${import.meta.env.VITE_API_BASE_URL}/extracted/${folderName}/`;
        const chapterRelativeDir = spine[currentIndex].substring(0, spine[currentIndex].lastIndexOf('/') + 1);
        const fullBaseUrl = baseUrl + chapterRelativeDir;
        
        const readerUrl = `${baseUrl}${spine[currentIndex]}`;
        const response = await fetch(readerUrl, { credentials: 'include' });
        let html = await response.text();

        html = html.replace(/(src|href)="([^":]+)"/g, (match, p1, p2) => {
          if (p2.startsWith('http') || p2.startsWith('data:') || p2.startsWith('blob:')) return match;
          try {
            const absoluteUrl = new URL(p2, fullBaseUrl).href;
            return `${ p1 }="${ absoluteUrl }" crossorigin="use-credentials"`;
          } catch(e) {
            return `${ p1 }="${ fullBaseUrl }${ p2 }" crossorigin="use-credentials"`;
          }
        });

        const style = `
          <style>
            html { height: 100vh !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }
            body {
              margin: 0 !important; padding: 40px 60px !important;
              height: 100vh !important; width: 100vw !important;
              box-sizing: border-box !important;
              column-width: calc(100vw - 120px) !important;
              column-gap: 120px !important;
              column-fill: auto !important;
              transition: transform 0.3s ease-in-out !important;
              transition: transform 0.3s ease-in-out !important;
              font-family: ${fontInternalNames[fontRef.current]} !important;
              line-height: 1.7 !important;
              color: ${themes[themeRef.current].text} !important; background-color: ${themes[themeRef.current].bg} !important; font-size: ${fontSizeRef.current}px !important;
            }
            @media (max-width: 768px) {
              body { padding: 20px 20px !important; column-width: calc(100vw - 40px) !important; column-gap: 40px !important; font-size: 16px !important; }
            }
            img { max-width: 100% !important; max-height: calc(100vh - 100px) !important; object-fit: contain !important; display: block !important; margin: 20px auto !important; }
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
  }, [currentIndex, book, spine, isComic, id]);

  // Update Font Family & Re-calculate Pages
  useEffect(() => {
    if (!iframeRef.current || isComic) return;
    try {
        const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
        if (doc && doc.body) {

            // Apply Font & Size & Theme
            doc.body.style.setProperty('font-family', fontInternalNames[fontFamily], 'important');
            doc.body.style.setProperty('font-size', `${fontSize}px`, 'important');
            doc.body.style.setProperty('color', themes[theme].text, 'important');
            doc.body.style.setProperty('background-color', themes[theme].bg, 'important');
            
            // Recalculate Pages (Wait for reflow)
            setTimeout(() => {
                 const clientWidth = doc.documentElement.clientWidth;
                 const scrollWidth = doc.documentElement.scrollWidth;
                 if (clientWidth && scrollWidth) {
                     const pages = Math.max(1, Math.ceil(scrollWidth / clientWidth));
                     setTotalPages(pages);
                     setInternalPage(prev => {
                         const newPage = Math.min(prev, pages - 1);
                         if (doc.body) doc.body.style.transform = `translateX(-${newPage * clientWidth}px)`;
                         return newPage;
                     });
                 }
            }, 100);
        }
    } catch (e) {
        console.error("Failed to update font/layout", e);
    }
  }, [fontFamily, fontSize, theme, isComic]);

  // Save Progress
  useEffect(() => {
    if (isInitialized.current && initialToRestore === null && !loading && !contentLoading && currentIndex !== null && spine.length > 0) {
      const progress_percentage = ((currentIndex + (isComic ? 0 : internalPage / totalPages)) / spine.length) * 100;
      booksApi.updateProgress(id, { 
        current_index: currentIndex, 
        current_page: isComic ? 0 : internalPage,
        progress_percentage: Math.min(100, progress_percentage) 
      }).catch(err => console.error("Failed to save progress", err));
    }
  }, [currentIndex, internalPage, totalPages, loading, contentLoading, initialToRestore, spine.length, id, isComic]);

  const updateInternalPage = (newPage) => {
    if (!iframeRef.current || isComic) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
    const clientWidth = doc.documentElement.clientWidth;
    doc.body.style.transform = `translateX(-${newPage * clientWidth}px)`;
    setInternalPage(newPage);
  };

  const goToNext = useCallback(() => {
    if (isComic) {
        if (currentIndex < spine.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setComicImageLoading(true);
        }
    } else {
        if (internalPage < totalPages - 1) {
            updateInternalPage(internalPage + 1);
        } else if (currentIndex !== null && currentIndex < spine.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setInternalPage(0);
        }
    }
  }, [currentIndex, internalPage, totalPages, spine.length, isComic]);

  const goToPrev = useCallback(() => {
    if (isComic) {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            setComicImageLoading(true);
        }
    } else {
        if (internalPage > 0) {
            updateInternalPage(internalPage - 1);
        } else if (currentIndex !== null && currentIndex > 0) {
            setShouldJumpToLast(true);
            setCurrentIndex(prev => prev - 1);
        }
    }
  }, [currentIndex, internalPage, isComic]);

  // Keyboard navigation
  useEffect(() => {
      const handleKeyDown = (e) => {
          if (e.key === 'ArrowRight') goToNext();
          if (e.key === 'ArrowLeft') goToPrev();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev]);

  if (loading || preparing || currentIndex === null) {
    return (
      <div className="h-screen w-full bg-[#001e38] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#f1184c] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-white/70 text-sm">{preparing ? 'Preparing book...' : 'Loading...'}</p>
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

  return (
    <div className="h-screen w-full bg-[#0a0a0a] flex flex-col overflow-hidden animate-in fade-in duration-500 font-sans">
      <div className="h-14 bg-[#0a0a0a] border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/book/${id}`)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] leading-none mb-1">
              PAGE {currentIndex + 1}/{spine.length} {!isComic && `• SCR ${internalPage + 1}/${totalPages}`}
            </span>
            <span className="text-sm font-bold text-white leading-none truncate max-w-[200px] md:max-w-md">{book.book_title}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
            {isComic && (
                <button 
                    onClick={() => setFitMode(prev => prev === 'contain' ? 'width' : 'contain')}
                    className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white"
                    title={fitMode === 'contain' ? "Fit Width" : "Fit Page"}
                >
                    {fitMode === 'contain' ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
                </button>
            )}



            {!isComic && (
                <div className="relative">
                    <button 
                        onClick={() => setShowFontMenu(!showFontMenu)}
                        className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
                        title="Font Settings"
                    >
                        <Type size={20} />
                    </button>
                    
                    {showFontMenu && (
                        <div className="absolute top-full right-0 mt-2 w-72 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-xl overflow-hidden py-1 z-50">
                            <div className="px-3 py-2 text-xs font-bold text-white/40 uppercase tracking-wider border-b border-white/5 mb-1">
                                Font Style
                            </div>
                            {Object.keys(fontInternalNames).map((font) => (
                                <button
                                    key={font}
                                    onClick={() => {
                                        setFontFamily(font);
                                    }}
                                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/5 transition-colors ${fontFamily === font ? 'text-[#f1184c] font-bold' : 'text-white/80'}`}
                                >
                                    <span style={{ fontFamily: font === 'mono' ? 'monospace' : font === 'serif' ? 'serif' : 'sans-serif' }} className="text-base">
                                        Aa
                                    </span>
                                    <span className="capitalize">{font}</span>
                                    {fontFamily === font && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#f1184c]" />}
                                </button>
                            ))}

                            <div className="px-3 py-2 text-xs font-bold text-white/40 uppercase tracking-wider border-b border-white/5 mt-2 mb-1">
                                Font Size
                            </div>
                            <div className="flex items-center justify-between px-3 py-2">
                                <button 
                                    onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
                                    className="w-10 h-10 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors border border-white/10"
                                >
                                    <span className="text-xs font-bold">A-</span>
                                </button>
                                <span className="text-sm font-bold text-white">{fontSize}px</span>
                                <button 
                                    onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
                                    className="w-10 h-10 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors border border-white/10"
                                >
                                    <span className="text-lg font-bold">A+</span>
                                </button>
                            </div>


                            <div className="px-3 py-2 text-xs font-bold text-white/40 uppercase tracking-wider border-b border-white/5 mt-2 mb-1">
                                Theme
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2">
                                <button 
                                    onClick={() => setTheme('light')}
                                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors border ${theme === 'light' ? 'bg-white text-black border-white' : 'bg-transparent text-white/70 border-white/10 hover:bg-white/5'}`}
                                >
                                    <Sun size={16} />
                                    <span className="text-xs font-bold">Light</span>
                                </button>
                                <button 
                                    onClick={() => setTheme('dark')}
                                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors border ${theme === 'dark' ? 'bg-[#1a1a1a] text-white border-white/20' : 'bg-transparent text-white/70 border-white/10 hover:bg-white/5'}`}
                                >
                                    <Moon size={16} />
                                    <span className="text-xs font-bold">Dark</span>
                                </button>
                                <button 
                                    onClick={() => setTheme('sepia')}
                                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors border ${theme === 'sepia' ? 'bg-[#f4ecd8] text-[#5b4636] border-[#5b4636]/20' : 'bg-transparent text-white/70 border-white/10 hover:bg-white/5'}`}
                                >
                                    <BookOpen size={16} />
                                    <span className="text-xs font-bold">Sepia</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
             
             {/* Font Menu Overlay to close */}
             {showFontMenu && (
                 <div className="fixed inset-0 z-40" onClick={() => setShowFontMenu(false)} />
             )}            

            <div className="flex items-center bg-white/5 rounded-full px-1.5 py-1 border border-white/10">
                <button 
                    disabled={isComic ? currentIndex === 0 : (currentIndex === 0 && internalPage === 0)}
                    onClick={goToPrev}
                    className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="w-px h-4 bg-white/10 mx-1" />
                <button 
                    disabled={isComic ? currentIndex === spine.length - 1 : (currentIndex === spine.length - 1 && internalPage === totalPages - 1)}
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

      <div className="flex-1 bg-[#121212] relative flex justify-center overflow-hidden">
        <div className={`w-full max-w-6xl h-full shadow-2xl relative rounded-md overflow-hidden bg-black ${isComic ? '' : 'p-4 md:p-8'}`}>
            {(contentLoading || comicImageLoading) && (
                <div className="absolute inset-0 bg-black/50 z-20 flex items-center justify-center backdrop-blur-sm">
                    <div className="w-8 h-8 border-2 border-[#f1184c] border-t-transparent rounded-full animate-spin" />
                </div>
            )}
            
            {isComic ? (
                 <div className={`w-full h-full overflow-auto flex justify-center relative ${fitMode === 'contain' ? 'items-center' : 'items-start'}`} key={currentIndex}>
                    <img 
                        src={`${import.meta.env.VITE_API_BASE_URL}/api/books/${id}/pages?file=${encodeURIComponent(spine[currentIndex])}`}
                        className={`${fitMode === 'contain' ? 'max-h-full max-w-full object-contain' : 'w-full object-cover'} relative z-0`}
                        alt={`Page ${currentIndex + 1}`}
                        onLoad={() => setComicImageLoading(false)}
                        onError={() => { console.error("Image failed to load"); setComicImageLoading(false); }}
                    />
                     {/* Navigation Click Zones for Comic */}
                     <div 
                        onClick={goToPrev}
                        className={`absolute inset-y-0 left-0 w-16 md:w-32 cursor-pointer z-10 flex items-center justify-start pl-4 group ${currentIndex === 0 ? 'hidden' : ''}`}
                    >
                        <div className="w-12 h-12 rounded-full bg-black/0 group-hover:bg-white/10 flex items-center justify-center transition-all">
                            <ChevronLeft size={24} className="text-white/0 group-hover:text-white" />
                        </div>
                    </div>

                    <div 
                        onClick={goToNext}
                        className={`absolute inset-y-0 right-0 w-16 md:w-32 cursor-pointer z-10 flex items-center justify-end pr-4 group ${currentIndex === spine.length - 1 ? 'hidden' : ''}`}
                    >
                        <div className="w-12 h-12 rounded-full bg-black/0 group-hover:bg-white/10 flex items-center justify-center transition-all">
                            <ChevronRight size={24} className="text-white/0 group-hover:text-white" />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="w-full h-full bg-white rounded-lg overflow-hidden relative">
                    <iframe 
                        ref={iframeRef}
                        onLoad={handleIframeLoad}
                        srcDoc={htmlContent} 
                        className="w-full h-full border-none"
                        title={book.book_title}
                    />
                    {/* Navigation Click Zones for EPUB */}
                     <div 
                        onClick={goToPrev}
                        className={`absolute inset-y-0 left-0 w-16 md:w-32 cursor-pointer z-10 flex items-center justify-start pl-4 group ${currentIndex === 0 && internalPage === 0 ? 'hidden' : ''}`}
                    >
                        <div className="w-12 h-12 rounded-full bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-all">
                            <ChevronLeft size={24} className="text-black/0 group-hover:text-black/30" />
                        </div>
                    </div>

                    <div 
                        onClick={goToNext}
                        className={`absolute inset-y-0 right-0 w-16 md:w-32 cursor-pointer z-10 flex items-center justify-end pr-4 group ${currentIndex === spine.length - 1 && internalPage === totalPages - 1 ? 'hidden' : ''}`}
                    >
                        <div className="w-12 h-12 rounded-full bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-all">
                            <ChevronRight size={24} className="text-black/0 group-hover:text-black/30" />
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
