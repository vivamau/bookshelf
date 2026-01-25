import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import { 
  Home, 
  BookMarked, 
  Library as LibraryIcon, 
  Search, 
  Settings, 
  Users, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  Menu,
  Maximize2,
  Activity,
  Cast,
  ArrowLeft,
  BookOpen,
  Plus
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import BookDetails from './pages/BookDetails';
import Reader from './pages/Reader';
import AuthorDetails from './pages/AuthorDetails';
import Authors from './pages/Authors';
import Library from './pages/Library';
import { booksApi } from './api/api';

// UI Components
const SidebarItem = ({ icon: Icon, label, active, onClick, to }) => {
  const content = (
    <div 
      className={cn(
        "flex items-center gap-3 px-4 py-2 cursor-pointer transition-all duration-200 group",
        active ? "text-primary border-l-2 border-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      <Icon size={20} className={cn(active ? "text-primary" : "group-hover:text-foreground")} />
      <span className="text-sm font-medium">{label}</span>
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

const Section = ({ title, children, showAll = true }) => (
  <div className="flex flex-col gap-4 mb-10">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-bold tracking-tight text-foreground/90">{title}</h2>
      {showAll && (
        <div className="flex items-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors group">
          <span className="text-xs font-bold mr-1 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">View All</span>
          <ChevronRight size={18} />
        </div>
      )}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-5">
      {children}
    </div>
  </div>
);

function Layout({ children }) {
  const { user, logout, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('Home');
  const navigate = useNavigate();

  const navItems = [
    { label: 'Home', icon: Home, to: '/' },
    { label: 'Read Lists', icon: BookMarked },
    { label: 'Library', icon: LibraryIcon, to: '/library' },
    { label: 'Authors', icon: Users, to: '/authors' }, // Re-adding authors link too just in case
    { label: 'Discover', icon: Search },
  ];

  const adminItems = [
    { label: 'Manage Users', icon: Users, permission: 'userrole_manageusers' },
    { label: 'Add Book', icon: Plus, permission: 'userrole_managebooks' },
    { label: 'Settings', icon: Settings, permission: 'userrole_managebooks' },
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

        <nav className="flex-1 flex flex-col gap-1">
          {navItems.map((item) => (
            <SidebarItem 
              key={item.label} 
              icon={item.icon} 
              label={item.label} 
              to={item.to}
              active={window.location.pathname === (item.to || '/_')}
            />
          ))}

          {/* Role Indicator */}
          <div className="mt-8 px-6 mb-4">
             <div className="bg-secondary/50 border border-border p-3 rounded-lg">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 leading-none">Access Level</p>
                <p className="text-sm font-black text-primary truncate leading-none">
                    {hasPermission('userrole_manageusers') ? 'LIBRARIAN' : hasPermission('userrole_readbooks') ? 'READER' : 'GUEST'}
                </p>
             </div>
          </div>

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
                  active={false}
                />
              ))}
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors group">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border group-hover:border-primary/50 transition-colors">
               <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`} alt="Avatar" className="rounded-full" />
            </div>
            <div className="flex flex-col overflow-hidden flex-1">
              <span className="text-sm font-bold truncate">{user?.username || 'User'}</span>
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
                <Menu size={20} className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                <ArrowLeft onClick={() => navigate(-1)} size={20} className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
            </div>
            
            <div className="flex-1 max-w-2xl relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Search for books, authors, genres..."
                className="w-full bg-secondary/30 border border-transparent focus:border-primary/20 focus:bg-secondary/50 rounded-full py-2.5 pl-12 pr-6 text-sm transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-6 text-muted-foreground">
            <Activity size={20} className="hover:text-foreground cursor-pointer transition-colors" />
            <Settings size={20} className="hover:text-foreground cursor-pointer transition-colors" />
            <Cast size={20} className="hover:text-foreground cursor-pointer transition-colors" />
            <Maximize2 size={18} className="hover:text-foreground cursor-pointer transition-colors text-foreground/80" />
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

function Dashboard() {
  const { user, hasPermission } = useAuth();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const res = await booksApi.getAll();
        setBooks(res.data.data);
      } catch (err) {
        console.error("Failed to fetch books", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBooks();
  }, []);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

        {/* Tabs */}
        <div className="flex items-center gap-8 px-10 pt-8 pb-4 text-xs font-black uppercase tracking-[2px] text-muted-foreground overflow-x-auto whitespace-nowrap hide-scrollbar z-10">
          <span className="text-primary border-b-2 border-primary pb-1 cursor-pointer">Explore</span>
          <span className="hover:text-foreground cursor-pointer transition-colors">Trending</span>
          <span className="hover:text-foreground cursor-pointer transition-colors">Recommended</span>
          <span className="hover:text-foreground cursor-pointer transition-colors">New arrivals</span>
          <span onClick={() => navigate('/authors')} className="hover:text-foreground cursor-pointer transition-colors">Authors</span>
          <span className="hover:text-foreground cursor-pointer transition-colors">Genres</span>
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
              {books.length > 0 && hasPermission('userrole_readbooks') && (
                <Section title="Continue Reading">
                  {books.filter(b => b.book_progress_percentage > 0).slice(0, 5).map((book, idx) => (
                    <BookCard 
                        key={book.ID} 
                        id={book.ID}
                        title={book.book_title} 
                        year={book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}
                        progress={book.book_progress_percentage} 
                        cover={book.book_cover_img ? `http://localhost:3005/covers/${book.book_cover_img}` : null} 
                    />
                  ))}
                </Section>
              )}

              <Section title="Recently Added Books">
                {books.map((book) => (
                  <BookCard 
                    key={book.ID} 
                    id={book.ID}
                    title={book.book_title} 
                    year={book.book_date ? new Date(book.book_date).getFullYear() : 'N/A'}
                    progress={book.book_progress_percentage}
                    cover={book.book_cover_img ? `http://localhost:3005/covers/${book.book_cover_img}` : null} 
                  />
                ))}
              </Section>

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
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="h-screen w-full bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
  
  if (!user) return <Login />;

  return (
    <Routes>
      <Route path="/" element={<Layout><Dashboard /></Layout>} />
      <Route path="/book/:id" element={<Layout><BookDetails /></Layout>} />
      <Route path="/author/:id" element={<Layout><AuthorDetails /></Layout>} />
      <Route path="/authors" element={<Layout><Authors /></Layout>} />
      <Route path="/library" element={<Layout><Library /></Layout>} />
      <Route path="/reader/:id" element={<Reader />} />
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
