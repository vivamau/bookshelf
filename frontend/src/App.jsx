import React, { useState, useEffect, useRef } from 'react';
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
  SlidersHorizontal,
  Headphones,
  Play,
  Pause,
  Music2,
  ListMusic,
  HardDrive,
  Pencil,
  Check,
  X,
  Loader,
  Trash2,
  Download,
  ImagePlus,
  Link2,
  Layers3,
  LayoutGrid,
  Tag
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
import SearchResults from './pages/SearchResults';
import AuthorSearch from './components/AuthorSearch';
import GenreSearch from './components/GenreSearch';
import { audiobooksApi, booksApi, libraryApi, genresApi, searchApi } from './api/api';
import {
  getAudiobookFolderCandidates,
  getAudiobookPlaybackError,
  getAudiobookProgressLabel,
  normalizeAudiobookProgress,
  resolveAudiobookResume,
  shouldPersistAudiobookProgress
} from './lib/audiobookProgress';
import { truncateAudiobookTitle } from './lib/audiobookTitle';
import {
  getAudiobookSeriesCompletion,
  getAudiobookSeriesLabel
} from './lib/audiobookSeries';
import ProfileModal from './components/ProfileModal';
import InstallPWA from './components/InstallPWA';
import { getOfflineBooks, getOfflineProgress, syncPendingProgress } from './lib/offline';
import { getHomeTabsForRole } from './lib/homeTabs';

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
    <div
      onClick={() => navigate(navigator.onLine === false ? `/reader/${id}` : `/book/${id}`)}
      className="flex flex-col gap-2 group cursor-pointer animate-in fade-in zoom-in duration-500"
    >
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

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1024
    ? `${(megabytes / 1024).toFixed(1)} GB`
    : `${Math.max(1, Math.round(megabytes))} MB`;
};

const formatAudiobookAuthors = (authors) => (
  Array.isArray(authors)
    ? authors
        .map((author) => `${author.author_name || ''} ${author.author_lastname || ''}`.trim())
        .filter(Boolean)
        .join(', ')
    : ''
);

const AudiobookCard = ({ audiobook, index }) => {
  const navigate = useNavigate();
  const authorNames = formatAudiobookAuthors(audiobook.authors);
  const completionPercentage = normalizeAudiobookProgress(audiobook.progress_percentage);
  const completionLabel = getAudiobookProgressLabel(completionPercentage);
  const coverUrl = audiobook.coverPath
    ? `${import.meta.env.VITE_API_BASE_URL}/api/audiobooks/cover?path=${encodeURIComponent(audiobook.coverPath)}&v=${encodeURIComponent(audiobook.modifiedAt)}`
    : null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/audiobook?folder=${encodeURIComponent(audiobook.folder)}`)}
      className="group min-w-0 text-left animate-in fade-in slide-in-from-bottom-3 duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background rounded-2xl"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      aria-label={`Open ${audiobook.title}. ${completionLabel}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-secondary/30 shadow-lg shadow-black/10 transition-all duration-500 group-hover:-translate-y-1 group-hover:border-primary/50 group-hover:shadow-[0_18px_40px_rgba(241,24,76,0.16)]">
        <div className="absolute inset-0 flex items-center justify-center text-primary/35" aria-hidden="true">
          <Headphones size={62} strokeWidth={1.25} />
        </div>
        {coverUrl && (
          <img
            key={coverUrl}
            src={coverUrl}
            alt={`Cover of ${audiobook.title}`}
            crossOrigin="use-credentials"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-md">
          {audiobook.trackCount} {audiobook.trackCount === 1 ? 'track' : 'tracks'}
        </div>
        <div className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/65 px-2.5 py-1 text-[9px] font-black tabular-nums tracking-[0.12em] text-white backdrop-blur-md">
          {Math.round(completionPercentage)}%
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 text-white">
          <span className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-white/75">
            {audiobook.formats.join(' · ')}
          </span>
          <span className="shrink-0 text-[10px] font-bold text-white/70">{formatFileSize(audiobook.totalSize)}</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/45" aria-hidden="true">
          <div
            className="h-full bg-primary transition-[width] duration-500"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>
      <div className="px-1 pt-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug transition-colors group-hover:text-primary">
          {truncateAudiobookTitle(audiobook.title)}
        </h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {authorNames || audiobook.tracks[0]?.title || 'Audio collection'}
        </p>
        <p className={cn(
          "mt-1.5 text-[10px] font-black uppercase tracking-[0.14em]",
          completionPercentage > 0 ? "text-primary" : "text-muted-foreground/70"
        )}>
          {completionLabel}
        </p>
      </div>
    </button>
  );
};

const AudiobookSeriesShelf = ({ series, index }) => {
  const completion = getAudiobookSeriesCompletion(series);

  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-border/80 bg-card/55 p-5 shadow-xl shadow-black/5 backdrop-blur-sm md:p-7">
      <div className="pointer-events-none absolute -right-2 -top-8 select-none text-[7rem] font-black leading-none text-primary/[0.035]" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </div>
      <header className="relative mb-6 flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.24em] text-primary">
            <Layers3 size={13} /> Series {String(index + 1).padStart(2, '0')}
          </p>
          <h3 className="truncate text-2xl font-black tracking-tight md:text-3xl">{series.name}</h3>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
          <span className="rounded-full border border-border bg-background/60 px-3 py-1.5">
            {series.audiobookCount} {series.audiobookCount === 1 ? 'book' : 'books'}
          </span>
          <span className="rounded-full border border-border bg-background/60 px-3 py-1.5">
            {completion.completed}/{completion.total} complete
          </span>
          <span className="rounded-full border border-border bg-background/60 px-3 py-1.5">
            {formatFileSize(series.totalSize)}
          </span>
        </div>
      </header>
      <div className="relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {series.audiobooks.map((audiobook, audiobookIndex) => (
          <AudiobookCard
            key={audiobook.folder}
            audiobook={audiobook}
            index={audiobookIndex}
          />
        ))}
      </div>
    </article>
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
    if (location.pathname === '/search') {
      setSearchResults(null);
      setShowResults(false);
      return undefined;
    }

    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2 && navigator.onLine !== false) {
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
  }, [location.pathname, searchQuery]);

  useEffect(() => {
    if (location.pathname === '/search') {
      setSearchQuery(new URLSearchParams(location.search).get('q') || '');
    }
  }, [location.pathname, location.search]);

  const openFullSearch = () => {
    const query = searchQuery.trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
    setShowResults(false);
  };

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
      const endpoint = taskType === 'scan' ? '/api/library/scan' : '/api/library/refresh-covers';
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${endpoint}`, {
        credentials: 'include'
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
    { label: 'Settings', icon: SlidersHorizontal, permission: 'userrole_readbooks', to: '/settings' },
  ];

  const adminItems = [
    { label: 'Manage Users', icon: UsersIcon, permission: 'userrole_manageusers', to: '/users' },
    { label: 'Add Book', icon: Plus, permission: 'userrole_managebooks', to: '/add-book' },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "w-64 border-r border-border bg-card flex flex-col pt-4 overflow-y-auto shrink-0 z-50 transition-transform duration-300 ease-in-out",
        "fixed inset-y-0 left-0 md:relative md:translate-x-0 md:z-20",
        isSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      )}>
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
          {navItems.filter(item => !item.permission || hasPermission(item.permission)).map((item) => (
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
        <header className="h-20 flex items-center px-4 md:px-8 gap-8 justify-between sticky top-0 bg-background/60 backdrop-blur-xl z-[30] border-b border-border/40">
          <div className="flex items-center gap-6 flex-1">
            <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors md:hidden"
                >
                  <Menu size={24} />
                </button>
                <ArrowLeft onClick={() => navigate(-1)} size={20} className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors hidden md:block" />
            </div>
            
            {location.pathname !== '/search' && (
            <div className="flex-1 max-w-2xl relative group z-50">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Search for books, authors, genres..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openFullSearch();
                  }
                }}
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
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={openFullSearch}
                        className="flex w-full items-center justify-between border-t border-border/60 bg-secondary/20 px-5 py-3 text-left text-xs font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/10"
                      >
                        Search the full catalogue
                        <ChevronRight size={16} />
                      </button>
                  </div>
              )}
            </div>
            )}
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
        <InstallPWA />
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
  const [audiobooks, setAudiobooks] = useState([]);
  const [audiobookSeries, setAudiobookSeries] = useState([]);
  const [audiobooksError, setAudiobooksError] = useState('');
  const [audiobookView, setAudiobookView] = useState(() => (
    new URLSearchParams(window.location.search).get('view') === 'series' ? 'series' : 'all'
  ));
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    return ['Explore', 'Trending', 'Genres', 'Audiobooks'].includes(requestedTab) ? requestedTab : 'Explore';
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const currentRole = hasPermission('userrole_manageusers')
    ? 'librarian'
    : hasPermission('userrole_readbooks')
      ? 'reader'
      : 'guest';
  const homeTabs = getHomeTabsForRole(currentRole);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (activeTab === 'Audiobooks') {
          setAudiobooksError('');
          const audiobooksResponse = await audiobooksApi.getAll();
          const seriesResponse = await audiobooksApi.getSeries();
          setAudiobooks(audiobooksResponse.data.data || []);
          setAudiobookSeries(seriesResponse.data.data || []);
          return;
        }

        if (navigator.onLine === false) {
          const storedBooks = await getOfflineBooks(user?.id);
          const localBooks = await Promise.all(storedBooks.map(async (storedBook) => {
            const progress = await getOfflineProgress(user.id, storedBook.bookId).catch(() => null);
            return {
              ...storedBook.metadata,
              ID: storedBook.bookId,
              book_progress_percentage: progress?.progress_percentage
                ?? storedBook.metadata.book_progress_percentage
                ?? 0
            };
          }));
          setBooks(localBooks);
          setContinueReading(localBooks.filter((book) => book.book_progress_percentage > 0));
          setMostRead(localBooks);
          setMostDownloaded(localBooks);
          setGenresWithBooks([]);
          return;
        }

        if (activeTab === 'Explore') {
          const [booksRes, continueRes] = await Promise.all([
              booksApi.getAll({ sort: 'latest', limit: 24 }),
              booksApi.getContinueReading()
          ]);
          setBooks(booksRes.data.data || []);
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
        if (activeTab === 'Audiobooks') {
          setAudiobooksError('The server audiobook collection could not be loaded.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeTab, user?.id]);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

        {/* Tabs */}
        <div className="flex items-center gap-8 px-4 md:px-10 pt-8 pb-4 text-xs font-black uppercase tracking-[2px] text-muted-foreground overflow-x-auto whitespace-nowrap hide-scrollbar z-10" role="tablist" aria-label="Home sections">
          {homeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              disabled={!tab.selectable}
              onClick={() => {
                if (!tab.selectable) return;
                setActiveTab(tab.id);
                navigate(tab.id === 'Explore' ? '/' : `/?tab=${encodeURIComponent(tab.id)}`, { replace: true });
              }}
              className={cn(
                "pb-1 transition-all border-b-2 border-transparent",
                tab.selectable ? "cursor-pointer hover:text-foreground" : "cursor-default opacity-70",
                activeTab === tab.id && "text-primary border-primary"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-10 pt-6 pb-20 custom-scrollbar z-10">
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

              {activeTab === 'Audiobooks' && (
                <section className="animate-in fade-in duration-500">
                  <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-primary">Listening room</p>
                      <h2 className="text-3xl font-black tracking-tight md:text-4xl">Audiobooks</h2>
                      <p className="mt-2 text-sm text-muted-foreground">Collections uploaded from Settings appear here automatically.</p>
                    </div>
                    {!audiobooksError && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-full border border-border bg-card/70 p-1 shadow-sm" role="group" aria-label="Audiobook view">
                          {[
                            { id: 'all', label: 'All titles', icon: LayoutGrid },
                            { id: 'series', label: 'Series', icon: Layers3 }
                          ].map(({ id, label, icon: Icon }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                setAudiobookView(id);
                                navigate(`/?tab=Audiobooks${id === 'series' ? '&view=series' : ''}`, { replace: true });
                              }}
                              className={cn(
                                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors",
                                audiobookView === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                              )}
                              aria-pressed={audiobookView === id}
                            >
                              <Icon size={12} /> {label}
                            </button>
                          ))}
                        </div>
                        <span className="w-fit rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                          {audiobookView === 'series'
                            ? `${audiobookSeries.length} series`
                            : `${audiobooks.length} ${audiobooks.length === 1 ? 'audiobook' : 'audiobooks'}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {audiobooksError ? (
                    <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
                      {audiobooksError}
                    </div>
                  ) : audiobookView === 'series' && audiobookSeries.length > 0 ? (
                    <div className="flex flex-col gap-7">
                      {audiobookSeries.map((series, index) => (
                        <AudiobookSeriesShelf key={series.id} series={series} index={index} />
                      ))}
                    </div>
                  ) : audiobookView === 'series' && audiobooks.length > 0 ? (
                    <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card p-8 shadow-xl shadow-black/10 md:p-10">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.16),transparent_45%)] pointer-events-none" />
                      <div className="relative max-w-xl">
                        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/15 text-primary">
                          <Layers3 size={28} />
                        </div>
                        <h3 className="text-2xl font-black tracking-tight">No audiobook series yet.</h3>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          Open an audiobook, edit its metadata, and assign a series name and book position. Series also appear automatically in Audiobookshelf clients.
                        </p>
                      </div>
                    </div>
                  ) : audiobooks.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                      {audiobooks.map((audiobook, index) => (
                        <AudiobookCard key={audiobook.id} audiobook={audiobook} index={index} />
                      ))}
                    </div>
                  ) : (
                    <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card p-8 shadow-xl shadow-black/10 md:p-10">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.16),transparent_45%)] pointer-events-none" />
                      <div className="relative max-w-xl">
                        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/15 text-primary">
                          <Headphones size={28} />
                        </div>
                        <h3 className="text-2xl font-black tracking-tight">No audiobooks found yet.</h3>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          A librarian can select an audiobook folder in Settings. Its supported audio files will then appear here for everyone.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
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

function AudiobookDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = useAuth();
  const audioRef = useRef(null);
  const pendingResumeRef = useRef(null);
  const lastSavedPositionRef = useRef(0);
  const progressSaveChainRef = useRef(Promise.resolve());
  const deleteCancelButtonRef = useRef(null);
  const folder = new URLSearchParams(location.search).get('folder') || '';
  const [audiobook, setAudiobook] = useState(null);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [listeningProgress, setListeningProgress] = useState(0);
  const [isProgressAvailable, setIsProgressAvailable] = useState(true);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState('');
  const [isEditingCover, setIsEditingCover] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [isSavingCover, setIsSavingCover] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeletingAudiobook, setIsDeletingAudiobook] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [selectedAuthors, setSelectedAuthors] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [allGenres, setAllGenres] = useState([]);
  const [areGenresLoading, setAreGenresLoading] = useState(false);
  const [metadataForm, setMetadataForm] = useState({
    title: '',
    narrator: '',
    language: '',
    series: '',
    seriesSequence: '',
    publishedYear: '',
    description: ''
  });

  useEffect(() => {
    if (!showDeleteConfirmation) return undefined;
    deleteCancelButtonRef.current?.focus();

    const handleEscape = (event) => {
      if (event.key === 'Escape' && !isDeletingAudiobook) setShowDeleteConfirmation(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showDeleteConfirmation, isDeletingAudiobook]);

  useEffect(() => {
    let cancelled = false;

    const loadAudiobook = async () => {
      if (!folder) {
        setError('No audiobook collection was selected.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        let response;
        let detailsError;
        for (const folderCandidate of getAudiobookFolderCandidates(folder)) {
          try {
            response = await audiobooksApi.getByFolder(folderCandidate);
            break;
          } catch (requestError) {
            detailsError = requestError;
            if (requestError.response?.status !== 404) throw requestError;
          }
        }
        if (!response) throw detailsError;

        const loadedAudiobook = response.data.data;
        let savedProgress = {
          track_path: loadedAudiobook.tracks[0]?.path,
          position_seconds: 0,
          progress_percentage: 0
        };
        let progressAvailable = true;
        try {
          const progressResponse = await audiobooksApi.getProgress(loadedAudiobook.folder);
          savedProgress = progressResponse.data.data;
        } catch (progressError) {
          console.error('Could not load audiobook progress', progressError);
          progressAvailable = false;
        }

        if (!cancelled) {
          const resume = resolveAudiobookResume(savedProgress, loadedAudiobook.tracks);
          setAudiobook(loadedAudiobook);
          setIsProgressAvailable(progressAvailable);
          pendingResumeRef.current = {
            trackPath: loadedAudiobook.tracks[resume.trackIndex]?.path,
            positionSeconds: resume.positionSeconds
          };
          lastSavedPositionRef.current = resume.positionSeconds;
          setSelectedTrackIndex(resume.trackIndex);
          setListeningProgress(resume.progressPercentage);
          setIsEditingCover(!loadedAudiobook.coverPath && hasPermission('userrole_managebooks'));
          setSelectedAuthors(loadedAudiobook.authors || []);
          setSelectedGenres(loadedAudiobook.genres || []);
          setMetadataForm({
            title: loadedAudiobook.title || '',
            narrator: loadedAudiobook.narrator || '',
            language: loadedAudiobook.language || '',
            series: loadedAudiobook.series || '',
            seriesSequence: loadedAudiobook.seriesSequence || '',
            publishedYear: loadedAudiobook.publishedYear ? String(loadedAudiobook.publishedYear) : '',
            description: loadedAudiobook.description || ''
          });
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.response?.data?.error || 'The audiobook could not be loaded.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAudiobook();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [folder, hasPermission]);

  const selectedTrack = audiobook?.tracks[selectedTrackIndex] || null;
  const coverUrl = audiobook?.coverPath
    ? `${import.meta.env.VITE_API_BASE_URL}/api/audiobooks/cover?path=${encodeURIComponent(audiobook.coverPath)}&v=${encodeURIComponent(audiobook.modifiedAt)}`
    : null;
  const audioUrl = selectedTrack
    ? `${import.meta.env.VITE_API_BASE_URL}/api/audiobooks/audio?path=${encodeURIComponent(selectedTrack.path)}`
    : null;
  const audiobookFolder = audiobook?.folder || folder;

  const persistListeningProgress = ({
    track = selectedTrack,
    trackIndex = selectedTrackIndex,
    positionSeconds = audioRef.current?.currentTime || 0,
    durationSeconds = audioRef.current?.duration || 0,
    completed = false
  } = {}) => {
    if (!track || !isProgressAvailable || !Number.isFinite(positionSeconds) || positionSeconds < 0) return;

    const safeDuration = Number.isFinite(durationSeconds) && durationSeconds >= 0
      ? durationSeconds
      : 0;
    lastSavedPositionRef.current = positionSeconds;
    progressSaveChainRef.current = progressSaveChainRef.current
      .catch(() => undefined)
      .then(() => audiobooksApi.updateProgress(audiobookFolder, {
        trackPath: track.path,
        trackIndex,
        positionSeconds,
        durationSeconds: safeDuration,
        completed
      }))
      .then((response) => {
        setIsProgressAvailable(true);
        setListeningProgress(response.data.data.progress_percentage || 0);
      })
      .catch((progressError) => {
        setIsProgressAvailable(false);
        console.error('Could not save audiobook progress', progressError);
      });
  };

  const selectTrack = (index) => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setPlaybackError('');
    pendingResumeRef.current = null;
    lastSavedPositionRef.current = 0;
    persistListeningProgress({
      track: audiobook.tracks[index],
      trackIndex: index,
      positionSeconds: 0,
      durationSeconds: 0
    });
    setSelectedTrackIndex(index);
  };

  const togglePlayback = async () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      try {
        setPlaybackError('');
        await audioRef.current.play();
      } catch (playbackError) {
        console.error('Audiobook playback failed', playbackError);
        setPlaybackError('The browser could not start audiobook playback.');
      }
    } else {
      audioRef.current.pause();
    }
  };

  const openMetadataEditor = async () => {
    setMetadataForm({
      title: audiobook.title || '',
      narrator: audiobook.narrator || '',
      language: audiobook.language || '',
      series: audiobook.series || '',
      seriesSequence: audiobook.seriesSequence || '',
      publishedYear: audiobook.publishedYear ? String(audiobook.publishedYear) : '',
      description: audiobook.description || ''
    });
    setSelectedAuthors(audiobook.authors || []);
    setSelectedGenres(audiobook.genres || []);
    setMetadataError('');
    setIsEditingMetadata(true);
    setAreGenresLoading(true);
    try {
      const response = await genresApi.getAll();
      setAllGenres(response.data.data || []);
    } catch (requestError) {
      console.error('Could not load audiobook genres', requestError);
      setMetadataError('Genres could not be loaded. The other metadata fields remain editable.');
    } finally {
      setAreGenresLoading(false);
    }
  };

  const saveMetadata = async (event) => {
    event.preventDefault();
    if (selectedAuthors.length === 0) {
      setMetadataError('At least one author is required.');
      return;
    }
    setIsSavingMetadata(true);
    setMetadataError('');
    try {
      const response = await audiobooksApi.updateMetadata(audiobookFolder, {
        ...metadataForm,
        seriesSequence: metadataForm.series.trim() ? metadataForm.seriesSequence : '',
        authorIds: selectedAuthors.map((author) => author.ID),
        genreIds: selectedGenres.map((genre) => genre.ID)
      });
      const updatedAudiobook = response.data.data;
      setAudiobook(updatedAudiobook);
      setSelectedAuthors(updatedAudiobook.authors || []);
      setSelectedGenres(updatedAudiobook.genres || []);
      setMetadataForm({
        title: updatedAudiobook.title || '',
        narrator: updatedAudiobook.narrator || '',
        language: updatedAudiobook.language || '',
        series: updatedAudiobook.series || '',
        seriesSequence: updatedAudiobook.seriesSequence || '',
        publishedYear: updatedAudiobook.publishedYear ? String(updatedAudiobook.publishedYear) : '',
        description: updatedAudiobook.description || ''
      });
      setIsEditingMetadata(false);
    } catch (requestError) {
      setMetadataError(requestError.response?.data?.error || 'The audiobook metadata could not be saved.');
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const saveCoverFromUrl = async (event) => {
    event.preventDefault();
    const coverUrlValue = coverUrlInput.trim();
    if (!coverUrlValue) return;

    setIsSavingCover(true);
    setCoverError('');
    try {
      const response = await audiobooksApi.setCoverFromUrl(audiobookFolder, coverUrlValue);
      setAudiobook(response.data.data);
      setCoverUrlInput('');
      setIsEditingCover(false);
    } catch (requestError) {
      setCoverError(requestError.response?.data?.error || 'The audiobook cover could not be updated.');
    } finally {
      setIsSavingCover(false);
    }
  };

  const downloadAudiobook = () => {
    const downloadLink = document.createElement('a');
    downloadLink.href = audiobooksApi.getDownloadUrl(audiobookFolder);
    downloadLink.rel = 'noopener';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  };

  const deleteAudiobook = async () => {
    setIsDeletingAudiobook(true);
    setDeleteError('');
    try {
      await audiobooksApi.remove(audiobookFolder);
      navigate('/?tab=Audiobooks', { replace: true });
    } catch (requestError) {
      setDeleteError(requestError.response?.data?.error || 'The audiobook could not be deleted.');
      setIsDeletingAudiobook(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!audiobook || error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background px-6 text-center text-muted-foreground">
        <Headphones size={64} className="mb-5 opacity-20" />
        <h1 className="text-2xl font-black text-foreground">Audiobook unavailable</h1>
        <p className="mt-2 max-w-md text-sm">{error || 'This collection is no longer available on the server.'}</p>
        <button type="button" onClick={() => navigate('/?tab=Audiobooks')} className="mt-6 font-bold text-primary hover:underline">
          Return to Audiobooks
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background animate-in fade-in duration-700">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[68vh] overflow-hidden">
        {coverUrl ? (
          <img src={coverUrl} alt="" crossOrigin="use-credentials" className="h-full w-full scale-110 object-cover opacity-25 blur-[110px]" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_25%_20%,hsl(var(--primary)/0.25),transparent_55%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/65 to-background" />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-20 pt-10 custom-scrollbar md:px-12 lg:px-16">
        <button
          type="button"
          onClick={() => navigate('/?tab=Audiobooks')}
          className="group mb-8 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-1" />
          Audiobooks
        </button>

        <div className="grid items-start gap-9 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14">
          <div className="mx-auto w-full max-w-[300px] lg:mx-0">
            <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-primary/20 via-card to-secondary/40 shadow-2xl shadow-black/35">
              <div className="absolute inset-0 flex items-center justify-center text-primary/35" aria-hidden="true">
                <Headphones size={96} strokeWidth={1} />
              </div>
              {coverUrl && (
                <img
                  key={coverUrl}
                  src={coverUrl}
                  alt={`Cover of ${audiobook.title}`}
                  crossOrigin="use-credentials"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(event) => { event.currentTarget.style.display = 'none'; }}
                />
              )}
            </div>

            {hasPermission('userrole_managebooks') && (
              <div className="mt-4">
                {isEditingCover ? (
                  <form onSubmit={saveCoverFromUrl} className="rounded-2xl border border-primary/25 bg-card/80 p-4 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Link2 size={15} />
                      </span>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Remote image</p>
                        <p className="text-xs font-bold">{coverUrl ? 'Replace cover' : 'Add a cover'}</p>
                      </div>
                    </div>
                    <label className="sr-only" htmlFor="audiobook-cover-url">Cover image URL</label>
                    <input
                      id="audiobook-cover-url"
                      type="url"
                      required
                      maxLength={2048}
                      autoFocus
                      value={coverUrlInput}
                      onChange={(event) => setCoverUrlInput(event.target.value)}
                      placeholder="https://example.com/cover.jpg"
                      className="w-full rounded-xl border border-border bg-background/75 px-3.5 py-2.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
                    />
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">JPEG, PNG, or WebP · maximum 10 MB</p>
                    {coverError && (
                      <p role="alert" className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {coverError}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      {coverUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingCover(false);
                            setCoverUrlInput('');
                            setCoverError('');
                          }}
                          disabled={isSavingCover}
                          className="flex-1 rounded-xl border border-border px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary/30 hover:text-foreground disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSavingCover || !coverUrlInput.trim()}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isSavingCover ? <Loader size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                        {isSavingCover ? 'Saving…' : 'Use cover'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCoverError('');
                      setIsEditingCover(true);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card/70 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <ImagePlus size={14} />
                    Change cover
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border bg-card/70 p-3 backdrop-blur-md">
                <ListMusic size={16} className="mb-2 text-primary" />
                <p className="text-lg font-black">{audiobook.trackCount}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Tracks</p>
              </div>
              <div className="rounded-xl border border-border bg-card/70 p-3 backdrop-blur-md">
                <HardDrive size={16} className="mb-2 text-primary" />
                <p className="text-lg font-black">{formatFileSize(audiobook.totalSize)}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">On server</p>
              </div>
              <div className="rounded-xl border border-primary/25 bg-primary/10 p-3 backdrop-blur-md">
                <Check size={16} className="mb-2 text-primary" />
                <p className="text-lg font-black tabular-nums text-primary">
                  {isProgressAvailable ? `${Math.round(normalizeAudiobookProgress(listeningProgress))}%` : '—'}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Completion</p>
              </div>
            </div>
          </div>

          <div className="min-w-0 pt-1 lg:pt-5">
            <div className="mb-3 flex items-start justify-between gap-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Audiobook collection</p>
              <div className="flex shrink-0 flex-col items-stretch gap-2">
                {hasPermission('userrole_managebooks') && !isEditingMetadata && (
                  <button
                    type="button"
                    onClick={openMetadataEditor}
                    className="flex items-center justify-center gap-2 rounded-full border border-border bg-card/70 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Pencil size={13} />
                    Edit metadata
                  </button>
                )}
                <button
                  type="button"
                  onClick={downloadAudiobook}
                  className="flex items-center justify-center gap-2 rounded-full border border-border bg-card/70 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-md transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Download size={13} />
                  Download
                </button>
                {hasPermission('userrole_manageusers') && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError('');
                      setShowDeleteConfirmation(true);
                    }}
                    className="flex items-center justify-center gap-2 rounded-full border border-red-500 bg-red-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:border-red-400 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
                  >
                    <Trash2 size={13} className="text-white" />
                    Delete
                  </button>
                )}
              </div>
            </div>
            <h1 className="max-w-4xl break-words text-4xl font-black leading-[0.98] tracking-tighter text-foreground md:text-6xl">
              {audiobook.title}
            </h1>
            {audiobook.authors?.length > 0 && (
              <p className="mt-4 flex flex-wrap items-center gap-x-1.5 text-lg font-semibold text-muted-foreground">
                <span>by</span>
                {audiobook.authors.map((author, index) => (
                  <React.Fragment key={author.ID}>
                    <Link to={`/author/${author.ID}`} className="text-primary transition-colors hover:text-primary/80 hover:underline">
                      {author.author_name} {author.author_lastname}
                    </Link>
                    {index < audiobook.authors.length - 1 && <span>,</span>}
                  </React.Fragment>
                ))}
              </p>
            )}

            {getAudiobookSeriesLabel(audiobook) && (
              <button
                type="button"
                onClick={() => navigate('/?tab=Audiobooks&view=series')}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary transition-colors hover:border-primary/50 hover:bg-primary/15"
              >
                <Layers3 size={14} />
                {getAudiobookSeriesLabel(audiobook)}
              </button>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {(audiobook.genres || []).map((genre) => (
                <span
                  key={genre.ID}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary backdrop-blur-md"
                >
                  <Tag size={11} /> {genre.genere_title}
                </span>
              ))}
              {audiobook.formats.map((format) => (
                <span key={format} className="rounded-full border border-border bg-card/65 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-md">
                  {format}
                </span>
              ))}
              <span className="rounded-full border border-border bg-card/65 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-md">
                Updated {new Date(audiobook.modifiedAt).toLocaleDateString()}
              </span>
              {audiobook.publishedYear && (
                <span className="rounded-full border border-border bg-card/65 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-md">
                  {audiobook.publishedYear}
                </span>
              )}
              {audiobook.language && (
                <span className="rounded-full border border-border bg-card/65 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-md">
                  {audiobook.language}
                </span>
              )}
              {audiobook.narrator && (
                <span className="rounded-full border border-border bg-card/65 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground backdrop-blur-md">
                  Narrated by {audiobook.narrator}
                </span>
              )}
            </div>

            {isEditingMetadata ? (
              <form onSubmit={saveMetadata} className="mt-7 max-w-3xl rounded-2xl border border-primary/25 bg-card/85 p-5 shadow-2xl shadow-black/15 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Collection record</p>
                    <h2 className="mt-1 text-xl font-black">Edit metadata</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingMetadata(false)}
                    disabled={isSavingMetadata}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground disabled:opacity-40"
                    aria-label="Close metadata editor"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['title', 'Title', 300],
                    ['narrator', 'Narrator', 200],
                    ['language', 'Language', 100],
                    ['series', 'Series', 300]
                  ].map(([field, label, maxLength]) => (
                    <label key={field} className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
                      <input
                        type="text"
                      value={metadataForm[field]}
                      maxLength={maxLength}
                      onChange={(event) => setMetadataForm((current) => ({
                        ...current,
                        [field]: event.target.value,
                        ...(field === 'series' && !event.target.value.trim() ? { seriesSequence: '' } : {})
                      }))}
                        className="w-full rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                      />
                    </label>
                  ))}

                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Position in series</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={metadataForm.seriesSequence}
                      maxLength={50}
                      placeholder="e.g. 1 or 1.5"
                      disabled={!metadataForm.series.trim()}
                      onChange={(event) => setMetadataForm((current) => ({ ...current, seriesSequence: event.target.value }))}
                      className="w-full rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-45"
                    />
                  </label>

                  <div className="sm:col-span-2">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Authors</span>
                    <div className="flex flex-col gap-2">
                      <div className="mb-2 flex flex-wrap gap-2">
                        {selectedAuthors.map((author) => (
                          <div key={author.ID} className="flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-foreground">
                            <span>{author.author_name} {author.author_lastname}</span>
                            {selectedAuthors.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAuthors((current) => current.filter((item) => item.ID !== author.ID));
                                  setMetadataError('');
                                }}
                                className="p-0.5 transition-colors hover:text-destructive"
                                title="Remove author"
                                aria-label={`Remove ${author.author_name} ${author.author_lastname}`}
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <Plus size={14} className="shrink-0 text-muted-foreground" />
                        <AuthorSearch
                          className="min-w-[200px] flex-1"
                          placeholder="Add another author..."
                          onSelect={(author) => {
                            if (author) {
                              setSelectedAuthors((current) => current.some((item) => item.ID === author.ID)
                                ? current
                                : [...current, author]);
                              setMetadataError('');
                            }
                          }}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                      Audiobook authors use the same author records as books.
                    </p>
                  </div>

                  <div className="sm:col-span-2">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Genres</span>
                    <div className="rounded-xl border border-border bg-background/45 p-3.5">
                      <div className="mb-3 flex min-h-7 flex-wrap gap-2">
                        {selectedGenres.length > 0 ? selectedGenres.map((genre) => (
                          <div
                            key={genre.ID}
                            className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-primary"
                          >
                            <Tag size={11} />
                            <span>{genre.genere_title}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedGenres((current) => current.filter((item) => item.ID !== genre.ID))}
                              className="ml-0.5 rounded-full p-0.5 text-primary/65 transition-colors hover:bg-primary/15 hover:text-primary"
                              aria-label={`Remove ${genre.genere_title}`}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        )) : (
                          <span className="text-xs italic text-muted-foreground">No genres assigned.</span>
                        )}
                      </div>

                      {areGenresLoading ? (
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                          <Loader size={14} className="animate-spin" /> Loading shared genres…
                        </div>
                      ) : (
                        <GenreSearch
                          placeholder="Search or create a shared genre…"
                          allGenres={allGenres}
                          excludeIds={selectedGenres.map((genre) => genre.ID)}
                          onSelect={(genre) => {
                            if (!genre) return;
                            setSelectedGenres((current) => current.some((item) => item.ID === genre.ID)
                              ? current
                              : [...current, genre]);
                            setAllGenres((current) => current.some((item) => item.ID === genre.ID)
                              ? current
                              : [...current, genre]);
                            setMetadataError('');
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                      These are the same genre records used by ebooks and Audiobookshelf clients.
                    </p>
                  </div>

                  <label className="block sm:col-span-1">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Published year</span>
                    <input
                      type="number"
                      min="1"
                      max={new Date().getFullYear() + 1}
                      value={metadataForm.publishedYear}
                      onChange={(event) => setMetadataForm((current) => ({ ...current, publishedYear: event.target.value }))}
                      className="w-full rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</span>
                    <textarea
                      value={metadataForm.description}
                      maxLength={5000}
                      rows={4}
                      onChange={(event) => setMetadataForm((current) => ({ ...current, description: event.target.value }))}
                      className="w-full resize-y rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary"
                    />
                  </label>
                </div>

                {metadataError && (
                  <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {metadataError}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditingMetadata(false)}
                    disabled={isSavingMetadata}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-secondary/30 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingMetadata}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {isSavingMetadata ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
                    {isSavingMetadata ? 'Saving…' : 'Save metadata'}
                  </button>
                </div>
              </form>
            ) : audiobook.description ? (
              <p className="mt-7 max-w-3xl text-sm leading-7 text-muted-foreground">{audiobook.description}</p>
            ) : null}

            <div className="mt-8 max-w-3xl rounded-2xl border border-primary/20 bg-card/75 p-5 shadow-xl shadow-black/10 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95"
                  aria-label={isPlaying ? 'Pause audiobook' : 'Play audiobook'}
                >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Now selected</p>
                  <p className="mt-1 truncate text-sm font-bold">{selectedTrack?.title}</p>
                  <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
                    Chapter / track {selectedTrackIndex + 1} of {audiobook.trackCount} · {isProgressAvailable ? `${Math.round(listeningProgress)}% saved` : 'progress unavailable'}
                  </p>
                </div>
              </div>
              {isProgressAvailable && (
                <div
                  role="progressbar"
                  aria-label="Audiobook listening progress"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow={Math.round(listeningProgress)}
                  className="mt-4 h-1 overflow-hidden rounded-full bg-primary/10"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${listeningProgress}%` }}
                  />
                </div>
              )}
              <audio
                key={audioUrl}
                ref={audioRef}
                src={audioUrl}
                crossOrigin="use-credentials"
                controls
                preload="metadata"
                className="mt-4 w-full accent-primary"
                onPlay={() => {
                  setPlaybackError('');
                  setIsPlaying(true);
                }}
                onLoadedMetadata={(event) => {
                  setPlaybackError('');
                  const pendingResume = pendingResumeRef.current;
                  if (!pendingResume || pendingResume.trackPath !== selectedTrack?.path) return;
                  const maximumPosition = Number.isFinite(event.currentTarget.duration)
                    ? event.currentTarget.duration
                    : pendingResume.positionSeconds;
                  event.currentTarget.currentTime = Math.min(pendingResume.positionSeconds, maximumPosition);
                  pendingResumeRef.current = null;
                }}
                onTimeUpdate={(event) => {
                  if (shouldPersistAudiobookProgress(event.currentTarget.currentTime, lastSavedPositionRef.current)) {
                    persistListeningProgress();
                  }
                }}
                onPause={() => {
                  setIsPlaying(false);
                  persistListeningProgress();
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  persistListeningProgress({ completed: true });
                  if (selectedTrackIndex < audiobook.tracks.length - 1) {
                    const nextTrackIndex = selectedTrackIndex + 1;
                    pendingResumeRef.current = null;
                    lastSavedPositionRef.current = 0;
                    persistListeningProgress({
                      track: audiobook.tracks[nextTrackIndex],
                      trackIndex: nextTrackIndex,
                      positionSeconds: 0,
                      durationSeconds: 0
                    });
                    setSelectedTrackIndex(nextTrackIndex);
                  }
                }}
                onError={(event) => {
                  setIsPlaying(false);
                  setPlaybackError(getAudiobookPlaybackError(event.currentTarget.error?.code));
                }}
              >
                Your browser does not support audio playback.
              </audio>
              {playbackError && (
                <p role="alert" className="mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                  {playbackError}
                </p>
              )}
            </div>

            <p className="mt-5 flex items-center gap-2 truncate text-xs text-muted-foreground" title={audiobook.folder}>
              <HardDrive size={14} className="shrink-0" />
              {audiobook.folder}
            </p>
          </div>
        </div>

        <section className="mt-14">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary">Contents</p>
              <h2 className="text-2xl font-black tracking-tight">Chapters / tracks</h2>
            </div>
            <span className="text-xs font-bold text-muted-foreground">{audiobook.trackCount} total</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/65 backdrop-blur-xl">
            {audiobook.tracks.map((track, index) => {
              const isSelected = index === selectedTrackIndex;
              return (
                <button
                  key={track.path}
                  type="button"
                  onClick={() => selectTrack(index)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={cn(
                    "group flex w-full items-center gap-4 border-b border-border px-4 py-4 text-left transition-colors last:border-b-0 md:px-5",
                    isSelected ? "bg-primary/10" : "hover:bg-secondary/25"
                  )}
                >
                  <span className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-black transition-colors",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground group-hover:border-primary/40 group-hover:text-primary"
                  )}>
                    {isSelected && isPlaying ? <Music2 size={17} /> : String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-bold", isSelected && "text-primary")}>{track.title}</span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{track.format}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">{formatFileSize(track.size)}</span>
                  <Play size={16} className={cn("shrink-0 transition-all", isSelected ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100")} />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {showDeleteConfirmation && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-background/85 p-4 backdrop-blur-md animate-in fade-in duration-200"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDeletingAudiobook) {
              setShowDeleteConfirmation(false);
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-audiobook-title"
            aria-describedby="delete-audiobook-description"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-destructive/30 bg-card shadow-2xl shadow-black/40 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
          >
            <div className="relative border-b border-border bg-destructive/5 px-6 pb-5 pt-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-destructive" />
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  <Trash2 size={21} />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-destructive">Permanent removal</p>
                  <h2 id="delete-audiobook-title" className="text-xl font-black tracking-tight">Delete this audiobook?</h2>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p id="delete-audiobook-description" className="text-sm leading-relaxed text-muted-foreground">
                This permanently removes <span className="font-bold text-foreground">“{audiobook.title}”</span>, including every audio track, cover, and metadata file in its server folder.
              </p>
              <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive">
                This action cannot be undone.
              </div>

              {deleteError && (
                <p role="alert" className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {deleteError}
                </p>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  ref={deleteCancelButtonRef}
                  type="button"
                  onClick={() => setShowDeleteConfirmation(false)}
                  disabled={isDeletingAudiobook}
                  className="rounded-xl border border-border px-5 py-2.5 text-sm font-bold transition-colors hover:bg-secondary/30 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteAudiobook}
                  disabled={isDeletingAudiobook}
                  className="flex items-center justify-center gap-2 rounded-xl border border-red-500 bg-red-600 px-5 py-2.5 text-sm font-black text-white transition-colors hover:border-red-400 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                >
                  {isDeletingAudiobook ? <Loader size={16} className="animate-spin text-white" /> : <Trash2 size={16} className="text-white" />}
                  {isDeletingAudiobook ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthenticatedApp() {
  const { user, loading, hasPermission } = useAuth();

  useEffect(() => {
    if (!user) return undefined;

    const syncProgress = () => {
      syncPendingProgress(user.id, (bookId, progress) => booksApi.updateProgress(bookId, progress))
        .catch((err) => console.error('Offline progress sync failed', err));
    };

    syncProgress();
    window.addEventListener('online', syncProgress);
    return () => window.removeEventListener('online', syncProgress);
  }, [user]);
  
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
      <Route path="/audiobook" element={user ? <Layout><AudiobookDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/author/:id" element={user ? <Layout><AuthorDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/authors" element={user ? <Layout><Authors /></Layout> : <Navigate to="/login" />} />
      <Route path="/publisher/:id" element={user ? <Layout><PublisherDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/publishers" element={user ? <Layout><Publishers /></Layout> : <Navigate to="/login" />} />
      <Route path="/readlists" element={user ? <Layout><Readlists /></Layout> : <Navigate to="/login" />} />
      <Route path="/readlist/:id" element={user ? <Layout><ReadlistDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/genre/:id" element={user ? <Layout><GenreDetails /></Layout> : <Navigate to="/login" />} />
      <Route path="/library" element={user ? <Layout><Library /></Layout> : <Navigate to="/login" />} />
      <Route path="/search" element={user ? <Layout><SearchResults /></Layout> : <Navigate to="/login" />} />
      <Route path="/users" element={user ? (hasPermission('userrole_manageusers') ? <Layout><UsersPage /></Layout> : <Navigate to="/" />) : <Navigate to="/login" />} />
      <Route path="/settings" element={user ? (hasPermission('userrole_readbooks') ? <Layout><SettingsPage /></Layout> : <Navigate to="/" />) : <Navigate to="/login" />} />
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
