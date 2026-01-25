import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authorsApi } from '../api/api';
import { 
  User, 
  Search,
  ChevronDown, 
  LayoutGrid, 
  List, 
  SlidersHorizontal,
  Play,
  Shuffle
} from 'lucide-react';
import { cn, formatDate } from "@/lib/utils";

export default function Authors() {
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const navigate = useNavigate();

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
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
            <Play size={20} className="hover:text-foreground cursor-pointer transition-colors" />
            <Shuffle size={20} className="hover:text-foreground cursor-pointer transition-colors" />
            <SlidersHorizontal size={20} className="hover:text-foreground cursor-pointer transition-colors" />
            
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
    </div>
  );
}
