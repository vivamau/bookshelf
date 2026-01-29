import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams, Link, Navigate, useLocation } from 'react-router-dom';
import { 
  Home, 
  BookMarked, 
  Library as LibraryIcon, 
  Search, 
  Settings, 
  Users as UsersIcon, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  Menu,
  Shuffle, // Changed from Activity
  ArrowLeft,
  BookOpen,
  Plus,
  MoreVertical,
  RefreshCw,
  Building2,
  SlidersHorizontal
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import BookDetails from './pages/BookDetails';
import Reader from './pages/Reader';
import AuthorDetails from './pages/AuthorDetails';
import Authors from './pages/Authors';
import Library from './pages/Library';
import Publishers from './pages/Publishers';
import PublisherDetails from './pages/PublisherDetails';
import GenreDetails from './pages/GenreDetails';
import UsersPage from './pages/Users';
import SettingsPage from './pages/Settings';
import AddBook from './pages/AddBook';
import Readlists from './pages/Readlists';
import ReadlistDetails from './pages/ReadlistDetails';
import { booksApi, libraryApi, genresApi, searchApi } from './api/api';
import ProfileModal from './components/ProfileModal';

// UI Components
// ... (rest)

// UI Components
const SidebarItem = ({ icon: Icon, label, active, onClick, to, hasMenu, onMenuClick }) => {
  const content = (
    <div 
      className={cn(
        "flex items-center gap-3 px-4 py-2 cursor-pointer transition-all duration-200 group relative",
        active ? "text-primary border-l-2 border-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      <Icon size={20} className={cn(active ? "text-primary" : "group-hover:text-foreground")} />
      <span className="text-sm font-medium flex-1">{label}</span>
      {hasMenu && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMenuClick?.();
          }}
          className="p-1 rounded hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <MoreVertical size={14} />
        </button>
      )}
    </div>
  );

  if (to) return <Link to={to}>{content}</Link>;
  return <div onClick={onClick}>{content}</div>;
};

const BookCard = ({ title, year, cover, progress, id }) => {
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
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
           <div className="bg-primary p-2 rounded-full text-primary-foreground transform scale-50 group-hover:scale-100 transition-transform duration-300">
              <BookOpen size={20} />
           </div>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{title}</span>
        <span className="text-xs text-muted-foreground">{year || 'N/A'}</span>
      </div>
    </div>
  );
};

const Section = ({ title, children, showAll = true, to }) => (
  <div className="flex flex-col gap-4 mb-10">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold tracking-tight text-foreground/90">{title}</h2>
      {showAll && (
        <Link 
          to={to || "#"} 
          className="flex items-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors group"
        >
          <span className="text-xs font-bold mr-1 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">View All</span>
          <ChevronRight size={18} />
        </Link>
      )}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-5">
      {children}
    </div>
  </div>
);

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const [showLibraryMenu, setShowLibraryMenu] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanType, setScanType] = useState(''); // 'scan' or 'refresh'
  const [scanMessage, setScanMessage] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [currentScanningBook, setCurrentScanningBook] = useState('');
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        try {
          const res = await searchApi.search(searchQuery);
          setSearchResults(res.data.data);
          setShowResults(true);
        } catch (err) {
          console.error("Search failed", err);
        }
      } else {
        setSearchResults(null);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleShuffle = async () => {
    try {
      const res = await booksApi.getRandom();
      if (res.data.data && res.data.data.ID) {
        navigate(`/book/${res.data.data.ID}`);
      }
    } catch (err) {
      console.error('Failed to get random book:', err);
    }
  };

  const runLibraryTask = async (taskType) => {
    setIsScanning(true);
    setScanType(taskType);
    setScanMessage('');
    setScanProgress(0);
    setCurrentScanningBook('');
    setIsFadingOut(false);
    setShowLibraryMenu(false);
    
    try {
      const token = localStorage.getItem('token');
      const endpoint = taskType === 'scan' ? '/api/library/scan' : '/api/library/refresh-covers';
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep partial line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.substring(6));
              if (eventData.type === 'progress') {
                setCurrentScanningBook(eventData.message);
                const percent = Math.round((eventData.count / eventData.total) * 100);
                setScanProgress(percent);
              } else if (eventData.type === 'complete') {
                setScanMessage(eventData.message);
                setScanProgress(100);
                // Start fade out after 4 seconds, clear after 5
                setTimeout(() => setIsFadingOut(true), 4000);
                setTimeout(() => {
                  setScanMessage('');
                  setIsFadingOut(false);
                  setScanProgress(0);
                }, 5000);
              } else if (eventData.type === 'error') {
                setScanMessage('Scan failed: ' + eventData.error);
                setTimeout(() => setIsFadingOut(true), 4000);
                setTimeout(() => {
                  setScanMessage('');
                  setIsFadingOut(false);
                }, 5000);
              }
            } catch (e) {
              console.error('Error parsing SSE data', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanMessage('Scan connection lost. Check backend.');
      setTimeout(() => setIsFadingOut(true), 4000);
      setTimeout(() => {
        setScanMessage('');
        setIsFadingOut(false);
      }, 5000);
    } finally {
      setIsScanning(false);
    }
  };
  const navItems = [
    { label: 'Home', icon: Home, to: '/' },
    { label: 'Read Lists', icon: BookMarked, to: '/readlists' },
    { label: 'Authors', icon: UsersIcon, to: '/authors' },
    { label: 'Publishers', icon: Building2, to: '/publishers' },
    { label: 'Library', icon: LibraryIcon, to: '/library' },
  ];

  const adminItems = [
    { label: 'Manage Users', icon: UsersIcon, permission: 'userrole_manageusers', to: '/users' },
    { label: 'Add Book', icon: Plus, permission: 'userrole_managebooks', to: '/add-book' },
    { label: 'Settings', icon: SlidersHorizontal, permission: 'userrole_managebooks', to: '/settings' },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col pt-4 overflow-y-auto shrink-0 z-20">
        <div onClick={() => navigate('/')} className="px-6 mb-8 flex items-center gap-3 cursor-pointer">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-black text-xl shadow-lg shadow-primary/20">
            <BookOpen size={24} />
          </div>
          <span className="text-xl font-bold tracking-tighter text-foreground uppercase">Bookshelf</span>
        </div>
        
        {/* Role Indicator */}
        <div className="px-6 mb-6">
           <div className="bg-secondary/50 border border-border p-3 rounded-lg">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 leading-none">Access Level</p>
              <p className="text-sm font-black text-primary truncate leading-none">
                  {hasPermission('userrole_manageusers') ? 'LIBRARIAN' : hasPermission('userrole_readbooks') ? 'READER' : 'GUEST'}
              </p>
           </div>
        </div>

        <nav className="flex-1 flex flex-col gap-1">
          {navItems.map((item) => (
            <SidebarItem 
              key={item.label} 
              icon={item.icon} 
              label={item.label} 
              to={item.to}
              active={location.pathname === (item.to || '/_')}
              hasMenu={item.label === 'Library' && hasPermission('userrole_managebooks')}
              onMenuClick={() => setShowLibraryMenu(!showLibraryMenu)}
            />
          ))}
          
          {/* Library Menu Dropdown */}
          {showLibraryMenu && hasPermission('userrole_managebooks') && (
            <div className="mx-4 mb-2 bg-secondary/50 border border-border rounded-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
              <button
                onClick={() => runLibraryTask('scan')}
                disabled={isScanning}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} className={cn(isScanning && scanType === 'scan' && "animate-spin")} />
                <span>{isScanning && scanType === 'scan' ? 'Scanning...' : 'Scan Library Files'}</span>
              </button>
              <button
                onClick={() => runLibraryTask('refresh')}
                disabled={isScanning}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-white/5 transition-colors disabled:opacity-50 border-t border-border/50"
              >
                <RefreshCw size={16} className={cn(isScanning && scanType === 'refresh' && "animate-spin")} />
                <span>{isScanning && scanType === 'refresh' ? 'Refreshing...' : 'Refresh Covers'}</span>
              </button>
            </div>
          )}
          
          {/* Scan Status Message & Progress */}
          {(isScanning || scanMessage) && (
            <div className={cn(
                "mx-4 mb-2 bg-primary/5 border border-primary/20 rounded-lg p-3 animate-in fade-in slide-in-from-top-2 duration-500 transition-opacity duration-1000",
                isFadingOut ? "opacity-0" : "opacity-100"
            )}>
              {isScanning ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                        {scanType === 'scan' ? 'Scanning Library' : 'Refreshing Covers'}
                    </span>
                    <span className="text-[10px] font-black text-primary">{scanProgress}%</span>
                  </div>
                  <div className="h-1 w-full bg-primary/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300 ease-out" 
                      style={{ width: `${scanProgress}%` }} 
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground italic break-all overflow-hidden whitespace-pre-wrap" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{currentScanningBook}</p>
                </div>
              ) : (
                <p className="text-[10px] font-bold text-foreground leading-tight">{scanMessage}</p>
              )}
            </div>
          )}

          {(hasPermission('userrole_manageusers') || hasPermission('userrole_managebooks')) && (
            <div className="flex flex-col gap-1">
              <div className="mt-2 px-6 mb-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Management</span>
              </div>
              {adminItems.filter(item => hasPermission(item.permission)).map((item) => (
                <SidebarItem 
                  key={item.label} 
                  icon={item.icon} 
                  label={item.label} 
                  active={location.pathname === item.to}
                  to={item.to}
                />
              ))}
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors group">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border group-hover:border-primary/50 transition-colors">
               <img src={user?.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || user?.user_username || 'default'}`} alt="Avatar" className="rounded-full" />
            </div>
            <div className="flex flex-col overflow-hidden flex-1">
              <span className="text-sm font-bold truncate">{(user?.username || user?.user_username) || 'User'}</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter leading-none">Online</span>
            </div>
            <button onClick={logout} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative overflow-hidden">
        {/* Topbar */}
        <header className="h-20 flex items-center px-8 gap-8 justify-between sticky top-0 bg-background/60 backdrop-blur-xl z-[30] border-b border-border/40">
          <div className="flex items-center gap-6 flex-1">
            <div className="flex items-center gap-3">
                <ArrowLeft onClick={() => navigate(-1)} size={20} className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
            </div>
            
            <div className="flex-1 max-w-2xl relative group z-50">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Search for books, authors, genres..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if(searchQuery.length >= 2) setShowResults(true); }}
                onBlur={() => setTimeout(() => setShowResults(false), 200)}
                className="w-full bg-secondary/30 border border-transparent focus:border-primary/20 focus:bg-secondary/50 rounded-full py-2.5 pl-12 pr-6 text-sm transition-all outline-none"
              />
              
              {showResults && searchResults && (
                  <div className="absolute top-full mt-2 left-0 right-0 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 flex flex-col max-h-[70vh] overflow-y-auto custom-scrollbar">
                      {/* Books */}
                      {searchResults.books && searchResults.books.length > 0 && (
                          <div className="p-2 border-b border-border/40 last:border-0">
                              <h4 className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Books</h4>
                              {searchResults.books.map(book => (
                                  <div 
                                    key={book.ID} 
                                    onClick={() => { navigate(`/book/${book.ID}`); setShowResults(false); setSearchQuery(''); }}
                                    className="flex items-center gap-3 p-2 hover:bg-primary/10 rounded-lg cursor-pointer transition-colors group"
                                  >
                                      <div className="h-10 w-7 bg-muted rounded overflow-hidden flex-shrink-0 border border-border/50 group-hover:border-primary/50">
                                          {book.book_cover_img ? (
                                              <img src={`${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}`} className="w-full h-full object-cover" />
                                          ) : (
                                              <div className="w-full h-full flex items-center justify-center bg-secondary text-[8px] text-muted-foreground font-bold">N/A</div>
                                          )}
                                      </div>
                                      <div className="flex flex-col overflow-hidden">
                                          <span className="text-sm font-bold truncate text-foreground group-hover:text-primary transition-colors">{book.book_title}</span>
                                          <span className="text-[10px] text-muted-foreground">{new Date(book.book_create_date).getFullYear()}</span>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}

                      {/* Authors */}
                      {searchResults.authors && searchResults.authors.length > 0 && (
                          <div className="p-2 border-b border-border/40 last:border-0">
                               <h4 className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Authors</h4>
                               {searchResults.authors.map(author => (
                                   <div 
                                      key={author.ID}
                                      onClick={() => { navigate(`/author/${author.ID}`); setShowResults(false); setSearchQuery(''); }}
                                      className="flex items-center gap-3 p-2 hover:bg-primary/10 rounded-lg cursor-pointer transition-colors group"
                                   >
                                       <div className="h-8 w-8 rounded-full bg-secondary overflow-hidden flex-shrink-0 border border-border/50 group-hover:border-primary/50">
                                            <img 
                                                src={author.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author.author_name}${author.author_lastname}`} 
                                                className="w-full h-full object-cover" 
                                            />
                                       </div>
                                       <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                           {author.author_name} {author.author_lastname}
                                       </span>
                                   </div>
                               ))}
                          </div>
                      )}

                      {/* Genres */}
                      {searchResults.genres && searchResults.genres.length > 0 && (
                          <div className="p-2 border-b border-border/40 last:border-0">
                               <h4 className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Genres</h4>
                               {searchResults.genres.map(genre => (
                                   <div 
                                      key={genre.ID}
                                      onClick={() => { navigate(`/genre/${genre.ID}`); setShowResults(false); setSearchQuery(''); }}
                                      className="flex items-center gap-3 p-2 hover:bg-primary/10 rounded-lg cursor-pointer transition-colors group"
                                   >
                                       <div className="h-8 w-8 rounded bg-secondary/50 flex items-center justify-center text-muted-foreground group-hover:text-primary">
                                            <Shuffle size={14} />
                                       </div>
                                       <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                           {genre.genere_title}
                                       </span>
                                   </div>
                               ))}
                          </div>
                      )}
                      
                      {(!searchResults.books?.length && !searchResults.authors?.length && !searchResults.genres?.length) && (
                          <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                             <Search size={24} className="opacity-20" />
                             <span className="text-xs font-medium">No results found for "{searchQuery}"</span>
                          </div>
                      )}
                  </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 text-muted-foreground">
            <Shuffle 
                size={20} 
                className="hover:text-foreground cursor-pointer transition-colors" 
                onClick={handleShuffle}
            />
            <Settings 
                size={20} 
                className="hover:text-foreground cursor-pointer transition-colors" 
                onClick={() => setShowProfileModal(true)}
            />
          </div>
        </header>

        {children}
        
        <ProfileModal 
            isOpen={showProfileModal} 
            onClose={() => setShowProfileModal(false)} 
        />
      </div>
    </div>
  );
}


function Dashboard() {
  const { user, hasPermission } = useAuth();
  const [books, setBooks] = useState([]);
  const [continueReading, setContinueReading] = useState([]);
  const [mostRead, setMostRead] = useState([]);
  const [mostDownloaded, setMostDownloaded] = useState([]);
  const [genresWithBooks, setGenresWithBooks] = useState([]);
  const [activeTab, setActiveTab] = useState('Explore'); // 'Explore', 'Trending', etc.
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (activeTab === 'Explore') {
          const [booksRes, continueRes] = await Promise.all([
              booksApi.getAll(),
              booksApi.getContinueReading()
          ]);
          setBooks((booksRes.data.data || []).sort((a, b) => b.ID - a.ID));
          setContinueReading(continueRes.data.data || []);
        } else if (activeTab === 'Trending') {
          const [readRes, downloadRes] = await Promise.all([
              booksApi.getMostRead(),
              booksApi.getMostDownloaded()
          ]);
          setMostRead(readRes.data.data || []);
          setMostDownloaded(downloadRes.data.data || []);
        } else if (activeTab === 'Genres') {
          const res = await genresApi.getWithBooks();
          setGenresWithBooks(res.data.data || []);
        }
      } catch (err) {
        console.error(`Failed to fetch ${activeTab} data`, err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeTab]);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

        {/* Tabs */}
        <div className="flex items-center gap-8 px-10 pt-8 pb-4 text-xs font-black uppercase tracking-[2px] text-muted-foreground overflow-x-auto whitespace-nowrap hide-scrollbar z-10">
          <span 
            onClick={() => setActiveTab('Explore')}
            className={cn("pb-1 cursor-pointer transition-all", activeTab === 'Explore' ? "text-primary border-b-2 border-primary" : "hover:text-foreground")}
          >
            Explore
          </span>
          <span 
            onClick={() => setActiveTab('Trending')}
            className={cn("pb-1 cursor-pointer transition-all", activeTab === 'Trending' ? "text-primary border-b-2 border-primary" : "hover:text-foreground")}
          >
            Trending
          </span>
          <span className="hover:text-foreground cursor-pointer transition-colors">Recommended</span>
          <span 
            onClick={() => setActiveTab('Genres')}
            className={cn("pb-1 cursor-pointer transition-all", activeTab === 'Genres' ? "text-primary border-b-2 border-primary" : "hover:text-foreground")}
          >
            Genres
          </span>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-10 pt-6 pb-20 custom-scrollbar z-10">
          {loading ? (
             <div className="flex flex-col gap-8 opacity-50 animate-pulse">
                <div className="h-6 w-48 bg-muted rounded"></div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-5">
                    {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-[2/3] bg-muted rounded"></div>)}
                </div>
             </div>
          ) : (
            <>
              {activeTab === 'Explore' && (
                <>
                  {continueReading.length > 0 && hasPermission('userrole_readbooks') && (
                    <Section title="Continue Reading" showAll={false}>
                      {continueReading.map((book) => (
                        <BookCard 
                            key={book.ID} 
                            id={book.ID}
                            title={book.book_title} 
                            year={book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}
                            progress={book.book_progress_percentage} 
                            cover={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : null} 
                        />
                      ))}
                    </Section>
                  )}

                  <Section title="Recently Added Books" to="/library">
                    {books.slice(0, 24).map((book) => (
                      <BookCard 
                        key={book.ID} 
                        id={book.ID}
                        title={book.book_title} 
                        year={book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}
                        progress={book.book_progress_percentage}
                        cover={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : null} 
                      />
                    ))}
                  </Section>
                </>
              )}

              {activeTab === 'Trending' && (
                <>
                  <Section title="MOST READ" showAll={false}>
                    {mostRead.map((book) => (
                      <BookCard 
                        key={book.ID} 
                        id={book.ID}
                        title={book.book_title} 
                        year={book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}
                        progress={book.book_progress_percentage}
                        cover={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : null} 
                      />
                    ))}
                  </Section>

                  <Section title="MOST DOWNLOADED" showAll={false}>
                    {mostDownloaded.map((book) => (
                      <BookCard 
                        key={book.ID} 
                        id={book.ID}
                        title={book.book_title} 
                        year={book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}
                        progress={book.book_progress_percentage}
                        cover={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : null} 
                      />
                    ))}
                  </Section>
                </>
              )}

              {activeTab === 'Genres' && (
                <div className="flex flex-col gap-2">
                    {genresWithBooks.map(genre => (
                        <Section key={genre.ID} title={genre.genere_title} to={`/genre/${genre.ID}`}>
                            {genre.books.map(book => (
                                <BookCard 
                                    key={book.ID} 
                                    id={book.ID}
                                    title={book.book_title} 
                                    year={book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}
                                    progress={book.book_progress_percentage}
                                    cover={book.book_cover_img ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}` : null} 
                                />
                            ))}
                        </Section>
                    ))}
                </div>
              )}

              {!hasPermission('userrole_readbooks') && !loading && books.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-8 mb-10 flex flex-col items-center text-center max-w-2xl mx-auto">
                    <Library size={48} className="text-primary mb-4" />
                    <h3 className="text-lg font-bold mb-2">Ready to start reading?</h3>
                    <p className="text-muted-foreground text-sm mb-6 px-8">
                        You have access to explore our entire collection. Upgrade your account or sign in as a Reader to start reading books directly in your browser.
                    </p>
                    <button className="bg-primary text-primary-foreground font-bold px-6 py-2 rounded-full text-sm hover:scale-105 transition-transform shadow-lg shadow-primary/20 leading-none">
                        GET FULL ACCESS
                    </button>
                </div>
              )}
            </>
          )}
        </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { user, loading, hasPermission } = useAuth();
  
  if (loading) return (
    <div className="h-screen w-full bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
      
      {/* Protected Routes */}
      <Route path="/" element={user ? <Layout><Dashboard /></Layout> : <Navigate to="/login" />} />
      <Route path="/book/:id" element={user ? <Layout><BookDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/author/:id" element={user ? <Layout><AuthorDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/authors" element={user ? <Layout><Authors /></Layout> : <Navigate to="/login" />} />
      <Route path="/publisher/:id" element={user ? <Layout><PublisherDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/publishers" element={user ? <Layout><Publishers /></Layout> : <Navigate to="/login" />} />
      <Route path="/readlists" element={user ? <Layout><Readlists /></Layout> : <Navigate to="/login" />} />
      <Route path="/readlist/:id" element={user ? <Layout><ReadlistDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/genre/:id" element={user ? <Layout><GenreDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/library" element={user ? <Layout><Library /></Layout> : <Navigate to="/login" />} />
      <Route path="/users" element={user ? (hasPermission('userrole_manageusers') ? <Layout><UsersPage /></Layout> : <Navigate to="/" />) : <Navigate to="/login" />} />
      <Route path="/settings" element={user ? (hasPermission('userrole_managebooks') ? <Layout><SettingsPage /></Layout> : <Navigate to="/" />) : <Navigate to="/login" />} />
      <Route path="/add-book" element={user ? (hasPermission('userrole_managebooks') ? <Layout><AddBook /></Layout> : <Navigate to="/" />) : <Navigate to="/login" />} />
      <Route path="/reader/:id" element={user ? <Reader /> : <Navigate to="/login" />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </Router>
  );
}
