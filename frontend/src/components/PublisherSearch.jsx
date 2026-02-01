import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, Building2 } from 'lucide-react';
import { publishersApi } from '../api/api';
import { cn } from '../lib/utils';

const PublisherSearch = ({ onSelect, selectedPublisher, className, placeholder }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    
    // Create Mode State
    const [newPublisherName, setNewPublisherName] = useState('');
    const [creating, setCreating] = useState(false);

    const wrapperRef = useRef(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim()) {
                fetchPublishers(query);
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

    const fetchPublishers = async (searchTerm) => {
        setLoading(true);
        try {
            const res = await publishersApi.getAll({ search: searchTerm, limit: 10 });
            setSuggestions(res.data.data || []);
            setIsOpen(true);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newPublisherName) return;
        setCreating(true);
        try {
            const res = await publishersApi.create({
                publisher_name: newPublisherName,
                publisher_create_date: Date.now()
            });
            
            // Result structure from crudFactory is { data: { id: ..., ... } }
            const newPublisher = res.data.data;
            // Normalize ID for frontend consistency
            if (!newPublisher.ID && newPublisher.id) newPublisher.ID = newPublisher.id;
            
            onSelect(newPublisher);
            
            // Reset
            setIsCreating(false);
            setQuery('');
            setIsOpen(false);
        } catch (err) {
            console.error("Failed to create publisher", err);
        } finally {
            setCreating(false);
        }
    };

    if (selectedPublisher) {
        return (
            <div className={cn("flex items-center gap-2 bg-white/10 px-3 py-2 rounded-lg border border-white/20", className)}>
                <Building2 size={16} className="text-primary" />
                <span className="text-sm font-bold text-foreground">
                    {selectedPublisher.publisher_name}
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
                <p className="text-[10px] font-black uppercase text-primary tracking-widest">Create New Publisher</p>
                <div className="flex gap-2">
                    <input 
                        placeholder="Publisher Name"
                        value={newPublisherName}
                        onChange={e => setNewPublisherName(e.target.value)}
                        className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                        autoFocus
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
                        disabled={!newPublisherName || creating}
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
                    placeholder={placeholder || "Search or add publisher..."}
                    className="w-full bg-white/10 border border-white/20 rounded-lg pl-9 pr-4 py-2 text-sm font-bold text-foreground outline-none focus:border-primary focus:bg-white/15 transition-all placeholder:font-normal"
                />
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

            {isOpen && (query || suggestions.length > 0) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-60 flex flex-col">
                    <div className="overflow-y-auto max-h-[200px] custom-scrollbar">
                        {suggestions.map(publisher => (
                            <button
                                key={publisher.ID}
                                onClick={() => {
                                    onSelect(publisher);
                                    setQuery('');
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-primary/20 hover:text-white transition-colors flex items-center gap-2"
                            >
                                <Building2 size={14} className="opacity-50" />
                                <span className="font-bold">{publisher.publisher_name}</span>
                            </button>
                        ))}
                        {loading && (
                            <div className="px-4 py-2 text-xs text-muted-foreground italic">Searching...</div>
                        )}
                        {!loading && suggestions.length === 0 && query && (
                             <div className="px-4 py-2 text-xs text-muted-foreground italic">No publishers found</div>
                        )}
                    </div>
                    {query && (
                        <button
                            onClick={() => {
                                setNewPublisherName(query);
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

export default PublisherSearch;
