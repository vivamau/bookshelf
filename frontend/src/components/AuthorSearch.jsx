import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, User } from 'lucide-react';
import { authorsApi } from '../api/api';
import { cn } from '../lib/utils'; // Assuming this exists based on BookDetails usage

const AuthorSearch = ({ onSelect, selectedAuthor, className, placeholder }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    
    // Create Mode State
    const [newFirstName, setNewFirstName] = useState('');
    const [newLastName, setNewLastName] = useState('');
    const [creating, setCreating] = useState(false);

    const wrapperRef = useRef(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim()) {
                fetchAuthors(query);
            } else {
                setSuggestions([]);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchAuthors = async (searchTerm) => {
        setLoading(true);
        try {
            const res = await authorsApi.getAll({ search: searchTerm, limit: 10 });
            setSuggestions(res.data.data || []);
            setIsOpen(true);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newFirstName || !newLastName) return;
        setCreating(true);
        try {
            const res = await authorsApi.create({
                author_name: newFirstName,
                author_lastname: newLastName,
                author_create_date: Date.now()
            });
            
            // Result structure from crudFactory is { data: { id: ..., ... } }
            const newAuthor = res.data.data;
            onSelect(newAuthor);
            
            // Reset
            setIsCreating(false);
            setQuery('');
            setIsOpen(false);
        } catch (err) {
            console.error("Failed to create author", err);
        } finally {
            setCreating(false);
        }
    };

    if (selectedAuthor) {
        return (
            <div className={cn("flex items-center gap-2 bg-white/10 px-3 py-2 rounded-lg border border-white/20", className)}>
                <User size={16} className="text-primary" />
                <span className="text-sm font-bold text-foreground">
                    {selectedAuthor.author_name} {selectedAuthor.author_lastname}
                </span>
                <button 
                    onClick={() => onSelect(null)} 
                    className="ml-auto p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                    <X size={14} className="text-muted-foreground" />
                </button>
            </div>
        );
    }

    if (isCreating) {
        return (
            <div className={cn("flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-lg animate-in fade-in zoom-in duration-200", className)}>
                <p className="text-[10px] font-black uppercase text-primary tracking-widest">Create New Author</p>
                <div className="flex gap-2">
                    <input 
                        placeholder="First Name"
                        value={newFirstName}
                        onChange={e => setNewFirstName(e.target.value)}
                        className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                        autoFocus
                    />
                    <input 
                        placeholder="Last Name"
                        value={newLastName}
                        onChange={e => setNewLastName(e.target.value)}
                        className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                    />
                </div>
                <div className="flex justify-end gap-2 mt-1">
                    <button 
                        onClick={() => setIsCreating(false)} 
                        className="px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleCreate}
                        disabled={!newFirstName || !newLastName || creating}
                        className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("relative w-full", className)} ref={wrapperRef}>
            <div className="relative">
                <input
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => query && setIsOpen(true)}
                    placeholder={placeholder || "Search or add author..."}
                    className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-4 py-2 text-sm font-bold text-foreground outline-none focus:border-primary focus:bg-white/15 transition-all placeholder:font-normal"
                />
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

            {isOpen && (query || suggestions.length > 0) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-60 flex flex-col">
                    <div className="overflow-y-auto max-h-[200px] custom-scrollbar">
                        {suggestions.map(author => (
                            <button
                                key={author.ID}
                                onClick={() => {
                                    onSelect(author);
                                    setQuery('');
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-primary/20 hover:text-white transition-colors flex items-center gap-2"
                            >
                                <User size={14} className="opacity-50" />
                                <span className="font-bold">{author.author_name} {author.author_lastname}</span>
                            </button>
                        ))}
                        {loading && (
                            <div className="px-4 py-2 text-xs text-muted-foreground italic">Searching...</div>
                        )}
                        {!loading && suggestions.length === 0 && query && (
                             <div className="px-4 py-2 text-xs text-muted-foreground italic">No authors found</div>
                        )}
                    </div>
                    {query && (
                        <button
                            onClick={() => {
                                // Pre-fill with query if it looks like a name
                                const parts = query.split(' ');
                                if (parts.length > 0) setNewFirstName(parts[0]);
                                if (parts.length > 1) setNewLastName(parts.slice(1).join(' '));
                                setIsCreating(true);
                                setIsOpen(false);
                            }}
                            className="w-full text-left px-4 py-3 bg-primary/10 hover:bg-primary/20 border-t border-white/10 text-primary text-sm font-bold flex items-center gap-2 transition-colors"
                        >
                            <Plus size={16} />
                            Create "{query}"
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default AuthorSearch;
