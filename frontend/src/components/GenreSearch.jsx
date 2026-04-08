import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, Tag } from 'lucide-react';
import { genresApi } from '../api/api';
import { cn } from '../lib/utils';

const GenreSearch = ({ onSelect, allGenres = [], excludeIds = [], className, placeholder }) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newGenreName, setNewGenreName] = useState('');
    const [creating, setCreating] = useState(false);

    const wrapperRef = useRef(null);

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

    const filtered = allGenres.filter(g => {
        if (excludeIds.includes(String(g.ID)) || excludeIds.includes(Number(g.ID))) return false;
        if (!query.trim()) return true;
        return g.genere_title?.toLowerCase().includes(query.toLowerCase());
    });

    const handleCreate = async () => {
        if (!newGenreName.trim()) return;
        setCreating(true);
        try {
            const res = await genresApi.create({ genere_title: newGenreName.trim() });
            const newGenre = res.data.data;
            if (!newGenre.ID && newGenre.id) newGenre.ID = newGenre.id;
            if (!newGenre.genere_title) newGenre.genere_title = newGenreName.trim();

            onSelect(newGenre, true);

            setIsCreating(false);
            setNewGenreName('');
            setQuery('');
            setIsOpen(false);
        } catch (err) {
            console.error("Failed to create genre", err);
        } finally {
            setCreating(false);
        }
    };

    if (isCreating) {
        return (
            <div className={cn("flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-lg animate-in fade-in zoom-in duration-200", className)}>
                <p className="text-[10px] font-black uppercase text-primary tracking-widest">Create New Genre</p>
                <input
                    placeholder="Genre Name"
                    value={newGenreName}
                    onChange={e => setNewGenreName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    className="bg-black/20 border border-white/10 rounded px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                    autoFocus
                />
                <div className="flex justify-end gap-2 mt-1">
                    <button
                        onClick={() => { setIsCreating(false); setNewGenreName(''); }}
                        className="px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!newGenreName.trim() || creating}
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
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder || "Search or add genre..."}
                    className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-4 py-2 text-sm font-bold text-foreground outline-none focus:border-primary focus:bg-white/15 transition-all placeholder:font-normal"
                />
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

            {isOpen && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-60 flex flex-col">
                    <div className="overflow-y-auto max-h-[200px] custom-scrollbar">
                        {filtered.map(genre => (
                            <button
                                key={genre.ID}
                                onClick={() => {
                                    onSelect(genre, false);
                                    setQuery('');
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-primary/20 hover:text-white transition-colors flex items-center gap-2"
                            >
                                <Tag size={14} className="opacity-50" />
                                <span className="font-bold">{genre.genere_title}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && query && (
                            <div className="px-4 py-2 text-xs text-muted-foreground italic">No genres found</div>
                        )}
                        {filtered.length === 0 && !query && (
                            <div className="px-4 py-2 text-xs text-muted-foreground italic">All genres already added</div>
                        )}
                    </div>
                    {query && (
                        <button
                            onClick={() => {
                                setNewGenreName(query);
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

export default GenreSearch;
