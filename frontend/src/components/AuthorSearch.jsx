import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, User } from 'lucide-react';
import { authorsApi } from '../api/api';
import { cn } from '../lib/utils'; // Assuming this exists based on BookDetails usage
import { findExactAuthor, getAuthorFullName, normalizeAuthorName } from '../lib/authorIdentity';

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
    const [createError, setCreateError] = useState('');
    const [duplicateAuthor, setDuplicateAuthor] = useState(null);
    const [searchedQuery, setSearchedQuery] = useState('');
    const [searchError, setSearchError] = useState('');

    const wrapperRef = useRef(null);
    const searchRequestRef = useRef(0);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim()) {
                fetchAuthors(query);
            } else {
                setSuggestions([]);
                setSearchedQuery('');
                setSearchError('');
                setLoading(false);
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
        const requestId = ++searchRequestRef.current;
        setLoading(true);
        setSearchError('');
        try {
            const res = await authorsApi.getAll({ search: searchTerm, limit: 10 });
            if (requestId !== searchRequestRef.current) return;
            setSuggestions(res.data.data || []);
            setSearchedQuery(normalizeAuthorName(searchTerm).toLocaleLowerCase());
            setIsOpen(true);
        } catch (err) {
            console.error(err);
            if (requestId !== searchRequestRef.current) return;
            setSuggestions([]);
            setSearchedQuery('');
            setSearchError('Authors could not be searched. Try again before creating a new entry.');
        } finally {
            if (requestId === searchRequestRef.current) setLoading(false);
        }
    };

    const selectAuthor = (author) => {
        searchRequestRef.current += 1;
        onSelect(author);
        setQuery('');
        setSuggestions([]);
        setSearchedQuery('');
        setCreateError('');
        setDuplicateAuthor(null);
        setLoading(false);
        setIsCreating(false);
        setIsOpen(false);
    };

    const handleCreate = async () => {
        const firstName = normalizeAuthorName(newFirstName);
        const lastName = normalizeAuthorName(newLastName);
        if (!firstName || !lastName) return;
        setCreating(true);
        setCreateError('');
        setDuplicateAuthor(null);
        try {
            const fullName = normalizeAuthorName(`${firstName} ${lastName}`);
            const searchResponse = await authorsApi.getAll({ search: fullName, limit: 20 });
            const existingAuthor = findExactAuthor(searchResponse.data.data || [], fullName);
            if (existingAuthor) {
                setDuplicateAuthor(existingAuthor);
                setCreateError('This author already exists. Use the existing entry instead.');
                return;
            }

            const res = await authorsApi.create({
                author_name: firstName,
                author_lastname: lastName,
                author_create_date: Date.now()
            });
            
            // Result structure from crudFactory is { data: { id: ..., ... } }
            const newAuthor = res.data.data;
            // Normalize ID for frontend consistency
            if (!newAuthor.ID && newAuthor.id) newAuthor.ID = newAuthor.id;

            selectAuthor(newAuthor);
            setNewFirstName('');
            setNewLastName('');
        } catch (err) {
            console.error("Failed to create author", err);
            const existingAuthor = err.response?.data?.existingAuthor;
            if (err.response?.status === 409 && existingAuthor) {
                setDuplicateAuthor(existingAuthor);
                setCreateError(err.response.data.error || 'This author already exists. Use the existing entry instead.');
            } else {
                setCreateError(err.response?.data?.error || 'The author could not be created.');
            }
        } finally {
            setCreating(false);
        }
    };

    const normalizedQuery = normalizeAuthorName(query).toLocaleLowerCase();
    const exactMatch = findExactAuthor(suggestions, query);
    const canCreate = Boolean(
        normalizedQuery
        && searchedQuery === normalizedQuery
        && !loading
        && !searchError
        && !exactMatch
    );

    if (selectedAuthor) {
        return (
            <div className={cn("flex items-center gap-2 bg-white/10 px-3 py-2 rounded-lg border border-white/20", className)}>
                <User size={16} className="text-primary" />
                <span className="text-sm font-bold text-foreground">
                    {selectedAuthor.author_name} {selectedAuthor.author_lastname}
                </span>
                <button 
                    type="button"
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
                        type="button"
                        onClick={() => setIsCreating(false)} 
                        className="px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                    >
                        Cancel
                    </button>
                    <button 
                        type="button"
                        onClick={handleCreate}
                        disabled={!newFirstName || !newLastName || creating}
                        className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
                {createError && (
                    <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                        <p>{createError}</p>
                        {duplicateAuthor && (
                            <button
                                type="button"
                                onClick={() => selectAuthor(duplicateAuthor)}
                                className="mt-2 font-black text-primary hover:underline"
                            >
                                Use {getAuthorFullName(duplicateAuthor)}
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={cn("relative w-full", className)} ref={wrapperRef}>
            <div className="relative">
                <input
                    value={query}
                    onChange={(e) => {
                        const nextQuery = e.target.value;
                        searchRequestRef.current += 1;
                        setQuery(nextQuery);
                        setSearchedQuery('');
                        setSearchError('');
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
                                type="button"
                                key={author.ID}
                                onClick={() => {
                                    selectAuthor(author);
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
                        {exactMatch && (
                            <div role="status" className="border-t border-white/10 px-4 py-2 text-xs font-semibold text-amber-300">
                                This author already exists. Select the existing entry above.
                            </div>
                        )}
                        {searchError && (
                            <div role="alert" className="border-t border-white/10 px-4 py-2 text-xs font-semibold text-destructive">
                                {searchError}
                            </div>
                        )}
                    </div>
                    {canCreate && (
                        <button
                            type="button"
                            onClick={() => {
                                // Pre-fill with query if it looks like a name
                                const parts = normalizeAuthorName(query).split(' ');
                                if (parts.length > 0) setNewFirstName(parts[0]);
                                if (parts.length > 1) setNewLastName(parts.slice(1).join(' '));
                                setCreateError('');
                                setDuplicateAuthor(null);
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
