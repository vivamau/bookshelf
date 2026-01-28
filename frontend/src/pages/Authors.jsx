import { useAuth } from '../context/AuthContext';
import { 
  User, 
  Search,
  ChevronDown, 
  LayoutGrid, 
  List, 
  SlidersHorizontal,
  Play,
  Shuffle,
  Plus,
  X,
  Loader,
  AlertCircle
} from 'lucide-react';
import { cn, formatDate } from "@/lib/utils";

export default function Authors() {
  const { hasPermission } = useAuth();
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const navigate = useNavigate();

  // Add Author State
  const [isAddingAuthor, setIsAddingAuthor] = useState(false);
  const [newAuthor, setNewAuthor] = useState({ author_name: '', author_lastname: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAuthors = async () => {
      try {
        const res = await authorsApi.getAll();
        const data = res.data.data || [];
        setAuthors(data);
      } catch (err) {
        console.error("Failed to fetch authors", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAuthors();
  }, []);

  const handleAddAuthor = async (e) => {
    e.preventDefault();
    if (!newAuthor.author_name) {
        setError('First Name is required');
        return;
    }
    
    setSubmitting(true);
    setError('');

    try {
        const res = await authorsApi.create({
            author_name: newAuthor.author_name,
            author_lastname: newAuthor.author_lastname,
            author_create_date: Date.now(),
            author_update_date: Date.now()
        });
        
        // Refresh list or add directly
        const createdAuthor = res.data.data ? { ...newAuthor, ...res.data.data } : null;
        if (createdAuthor) {
            // Need to reload to get ID if not returned fully, but usually create returns ID
            // Let's just reload for safety or append if we trust return
            const refreshRes = await authorsApi.getAll();
            setAuthors(refreshRes.data.data || []);
            setIsAddingAuthor(false);
            setNewAuthor({ author_name: '', author_lastname: '' });
        }
    } catch (err) {
        console.error("Failed to create author", err);
        setError(err.response?.data?.error || 'Failed to create author');
    } finally {
        setSubmitting(false);
    }
  };

  const filteredAuthors = authors.filter(author => {
    const fullName = `${author.author_name} ${author.author_lastname}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-background">
       {/* Background Decoration */}
       <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2" />

      {/* Authors Toolbar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 bg-background/95 backdrop-blur z-20">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>All</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>
            
            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>Authors</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors">
                <span>By Name</span>
                <ChevronDown size={14} className="text-muted-foreground" />
            </div>

            <div className="h-6 w-px bg-white/10 mx-2" />
            
            <span className="text-xl font-bold text-foreground">{filteredAuthors.length}</span>
            
            {hasPermission('userrole_managebooks') && (
                <button 
                    onClick={() => setIsAddingAuthor(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-black uppercase tracking-wider transition-all border border-primary/20 hover:border-primary/50"
                >
                    <Plus size={14} />
                    Add Author
                </button>
            )}
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                    placeholder="Search authors..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-1.5 text-sm outline-none focus:border-primary/50 transition-all w-48 focus:w-64"
                />
            </div>
            
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-white/10 text-foreground" : "hover:text-foreground")}
                >
                    <LayoutGrid size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-white/10 text-foreground" : "hover:text-foreground")}
                >
                    <List size={18} />
                </button>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 md:px-12 py-12 custom-scrollbar relative z-10">
          {loading ? (
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 animate-pulse">
                {[1,2,3,4,5,6,7,8,9,10].map(i => (
                  <div key={i} className="h-32 bg-muted/40 rounded-xl" />
                ))}
             </div>
          ) : viewMode === 'list' ? (
              <div className="w-full">
                  <table className="w-full text-left border-collapse">
                      <thead>
                          <tr className="border-b border-white/10 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              <th className="py-4 pl-4 w-16"></th>
                              <th className="py-4">Name</th>
                              <th className="py-4">Role</th>
                              <th className="py-4">Added</th>
                          </tr>
                      </thead>
                      <tbody>
                          {filteredAuthors.map(author => (
                              <tr 
                                key={author.ID} 
                                onClick={() => navigate(`/author/${author.ID}`)}
                                className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
                              >
                                  <td className="py-3 pl-4">
                                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground overflow-hidden shrink-0">
                                          <img 
                                              src={author.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author.author_name}${author.author_lastname}`} 
                                              alt={author.author_name}
                                              className="w-full h-full object-cover"
                                          />
                                      </div>
                                  </td>
                                  <td className="py-3 font-bold text-foreground group-hover:text-primary transition-colors">
                                      {author.author_name} {author.author_lastname}
                                  </td>
                                  <td className="py-3 text-sm text-muted-foreground">Writer</td>
                                  <td className="py-3 text-sm text-muted-foreground">
                                      {formatDate(author.author_create_date)}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          ) : (
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {filteredAuthors.map(author => (
                  <div 
                    key={author.ID}
                    onClick={() => navigate(`/author/${author.ID}`)}
                    className="bg-card hover:bg-muted/50 border border-border/40 hover:border-primary/20 rounded-xl p-6 flex flex-col items-center text-center gap-4 cursor-pointer group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5"
                  >
                     <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-muted-foreground overflow-hidden shrink-0 transition-all group-hover:scale-105 border-4 border-transparent group-hover:border-primary/20">
                        <img 
                            src={author.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author.author_name}${author.author_lastname}`} 
                            alt={author.author_name}
                            className="w-full h-full object-cover"
                        />
                     </div>
                     <div className="flex flex-col gap-0.5">
                        <span className="text-lg font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                          {author.author_name} {author.author_lastname}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Writer
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 mt-1">
                            Added on {formatDate(author.author_create_date)}
                        </span>
                     </div>
                  </div>
                ))}
             </div>
          )}

          {!loading && filteredAuthors.length === 0 && (
             <div className="text-center py-20 opacity-50">
                <p className="text-xl font-bold">No authors found</p>
                <p className="text-sm">Try searching for a different name.</p>
             </div>
          )}
       </div>

       {/* Add Author Modal */}
       {isAddingAuthor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl relative animate-in zoom-in-95 duration-200">
                <button 
                    onClick={() => setIsAddingAuthor(false)}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X size={20} />
                </button>
                
                <h2 className="text-2xl font-black tracking-tight mb-2">Add New Author</h2>
                <p className="text-muted-foreground text-sm mb-6">Create a new author profile manually.</p>
                
                <form onSubmit={handleAddAuthor} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">First Name</label>
                        <input 
                            autoFocus
                            value={newAuthor.author_name}
                            onChange={e => setNewAuthor({...newAuthor, author_name: e.target.value})}
                            placeholder="e.g. Stephen"
                            className="bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-sm font-medium outline-none focus:border-primary/50 transition-all"
                        />
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Last Name</label>
                        <input 
                            value={newAuthor.author_lastname}
                            onChange={e => setNewAuthor({...newAuthor, author_lastname: e.target.value})}
                            placeholder="e.g. King"
                            className="bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-sm font-medium outline-none focus:border-primary/50 transition-all"
                        />
                    </div>

                    {error && (
                        <div className="bg-destructive/10 text-destructive text-xs font-bold px-4 py-3 rounded-lg flex items-center gap-2">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-4">
                         <button 
                            type="button"
                            onClick={() => setIsAddingAuthor(false)}
                            className="flex-1 py-3 rounded-xl font-bold text-sm bg-secondary/50 hover:bg-secondary text-foreground transition-colors"
                         >
                            Cancel
                         </button>
                         <button 
                            type="submit"
                            disabled={submitting || !newAuthor.author_name}
                            className="flex-1 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                         >
                            {submitting ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                            Create Author
                         </button>
                    </div>
                </form>
            </div>
        </div>
       )}
    </div>
  );
}
