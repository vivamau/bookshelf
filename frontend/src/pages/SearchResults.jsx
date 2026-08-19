import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { searchApi } from '../api/api';
import { cn } from '../lib/utils';
import { countActiveFilters, readSearchParams, toggleCsvValue } from '../lib/searchParams';

const coverUrl = (book) => book.book_cover_img
  ? `${import.meta.env.VITE_API_BASE_URL}/covers/${book.book_cover_img}`
  : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(book.book_title)}`;

const FilterTextInput = ({ label, value, placeholder, onCommit }) => {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => onCommit(draft.trim());

  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary/60"
      />
    </label>
  );
};

const FacetGroup = ({ title, items, selected, onToggle, valueKey = 'ID' }) => {
  if (!items?.length) return null;
  const selectedValues = String(selected || '').split(',').filter(Boolean);

  return (
    <section className="border-t border-border/60 pt-5 first:border-0 first:pt-0">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
      <div className="space-y-1">
        {items.map((item) => {
          const value = String(item[valueKey]);
          const active = selectedValues.includes(value);
          return (
            <button
              type="button"
              key={`${title}-${value}`}
              onClick={() => onToggle(value)}
              className={cn(
                'group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-secondary/60 hover:text-foreground'
              )}
            >
              <span className="truncate font-semibold">{item.label}</span>
              <span className={cn(
                'ml-3 rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums',
                active ? 'bg-black/20 text-white' : 'bg-background/70 text-muted-foreground group-hover:text-foreground'
              )}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default function SearchResults() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => readSearchParams(searchKey), [searchKey]);
  const [queryDraft, setQueryDraft] = useState(filters.q);
  const [result, setResult] = useState({ data: [], total: 0, facets: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = countActiveFilters(filters);
  const totalPages = Math.max(1, Math.ceil(result.total / filters.limit));

  useEffect(() => setQueryDraft(filters.q), [filters.q]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    searchApi.searchBooks(filters)
      .then((response) => {
        if (active) setResult(response.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || 'Search is temporarily unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [searchKey, retryToken]);

  const updateParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    });
    if (!Object.prototype.hasOwnProperty.call(changes, 'page')) next.delete('page');
    setSearchParams(next);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    updateParams({ q: queryDraft.trim() });
  };

  const toggleFacet = (key, value) => updateParams({ [key]: toggleCsvValue(filters[key], value) });

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (filters.q) next.set('q', filters.q);
    if (filters.sort !== 'relevance') next.set('sort', filters.sort);
    setSearchParams(next);
  };

  const facetPanel = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Refine</p>
          <h2 className="font-serif text-2xl font-bold">The catalogue</h2>
        </div>
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearFilters} className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary">
            <RotateCcw size={13} /> Reset
          </button>
        )}
      </div>

      <FacetGroup
        title="Format"
        items={result.facets?.formats}
        selected={filters.format}
        valueKey="label"
        onToggle={(value) => toggleFacet('format', value)}
      />
      <FacetGroup
        title="Language"
        items={result.facets?.languages}
        selected={filters.language}
        onToggle={(value) => toggleFacet('language', value)}
      />
      <FacetGroup
        title="Genre"
        items={result.facets?.genres}
        selected={filters.genre}
        onToggle={(value) => toggleFacet('genre', value)}
      />

      <section className="space-y-4 border-t border-border/60 pt-5">
        <FilterTextInput label="Author contains" value={filters.authorName} placeholder="e.g. Ursula Le Guin" onCommit={(value) => updateParams({ authorName: value })} />
        <FilterTextInput label="Publisher contains" value={filters.publisherName} placeholder="e.g. Penguin" onCommit={(value) => updateParams({ publisherName: value })} />
        <FilterTextInput label="Genre contains" value={filters.genreName} placeholder="e.g. science fiction" onCommit={(value) => updateParams({ genreName: value })} />
      </section>

      <section className="border-t border-border/60 pt-5">
        <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Publication year</h3>
        <div className="grid grid-cols-2 gap-2">
          <FilterTextInput label="From" value={filters.yearFrom} placeholder="1900" onCommit={(value) => updateParams({ yearFrom: value })} />
          <FilterTextInput label="To" value={filters.yearTo} placeholder="2026" onCommit={(value) => updateParams({ yearTo: value })} />
        </div>
      </section>
    </div>
  );

  return (
    <div className="relative flex-1 overflow-y-auto bg-background custom-scrollbar">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-24 -top-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-1/3 top-16 h-px w-1/2 bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-8 md:px-8 md:py-12">
        <header className="mb-10 grid gap-7 border-b border-border/70 pb-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-4xl">
            <div className="mb-4 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.28em] text-primary">
              <span className="h-px w-10 bg-primary" /> Bookshelf index
            </div>
            <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              {filters.q ? <>Results for <span className="italic text-primary">“{filters.q}”</span></> : 'Explore every shelf'}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Search titles, authors, summaries, ISBNs, publishers and filenames—then narrow the catalogue without losing relevance.
            </p>
          </div>
          <div className="flex items-baseline gap-2 border-l-2 border-primary pl-4">
            <span className="font-serif text-4xl font-bold tabular-nums">{result.total.toLocaleString()}</span>
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">books found</span>
          </div>
        </header>

        <form onSubmit={submitSearch} className="mb-8 flex gap-2 rounded-2xl border border-border bg-card/70 p-2 shadow-2xl shadow-black/10 backdrop-blur">
          <Search className="ml-3 mt-3 shrink-0 text-primary" size={21} />
          <input
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="A title, author, subject, ISBN…"
            aria-label="Search the catalogue"
            className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
          />
          {queryDraft && (
            <button type="button" onClick={() => setQueryDraft('')} className="hidden p-2 text-muted-foreground hover:text-foreground sm:block" aria-label="Clear search">
              <X size={18} />
            </button>
          )}
          <button type="submit" className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition-transform hover:scale-[1.02] md:px-6">
            Search <ArrowRight size={17} />
          </button>
        </form>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold lg:hidden"
          >
            <Filter size={16} /> Filters
            {activeFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-muted-foreground" />
            <select
              value={filters.sort}
              onChange={(event) => updateParams({ sort: event.target.value })}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold outline-none focus:border-primary/60"
              aria-label="Sort results"
            >
              <option value="relevance">Best match</option>
              <option value="latest">Recently added</option>
              <option value="title">Title A–Z</option>
              <option value="year">Publication year</option>
              <option value="popular">Most downloaded</option>
              <option value="readers">Most read</option>
            </select>
          </div>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="sticky top-4 hidden rounded-2xl border border-border/70 bg-card/55 p-5 shadow-xl shadow-black/10 backdrop-blur lg:block">
            {facetPanel}
          </aside>

          <main aria-live="polite">
            {error ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center">
                <p className="font-bold">{error}</p>
                <button type="button" onClick={() => setRetryToken((value) => value + 1)} className="mt-3 text-sm font-bold text-primary">Try again</button>
              </div>
            ) : loading ? (
              <div className="flex min-h-80 items-center justify-center">
                <Loader className="animate-spin text-primary" size={30} />
              </div>
            ) : result.data.length === 0 ? (
              <div className="flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 px-6 text-center">
                <BookOpen size={42} className="mb-4 text-primary/50" />
                <h2 className="font-serif text-2xl font-bold">No volume matches this trail.</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">Try fewer words, remove a filter, or search by an author or ISBN.</p>
                {activeFilterCount > 0 && <button type="button" onClick={clearFilters} className="mt-5 text-sm font-black text-primary">Clear all filters</button>}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {result.data.map((book, index) => (
                    <button
                      type="button"
                      key={book.ID}
                      onClick={() => navigate(`/book/${book.ID}`)}
                      className="group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
                    >
                      <div className="relative aspect-[2/3] overflow-hidden rounded-md border border-border bg-card shadow-lg shadow-black/20 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/60 group-hover:shadow-[0_18px_36px_rgba(241,24,76,0.14)]">
                        <img src={coverUrl(book)} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent px-3 pb-3 pt-10">
                          <div className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-widest text-white/75">
                            <span>{book.format_name || 'Book'}</span>
                            <span>{book.publication_year >= 1000 ? book.publication_year : 'Undated'}</span>
                          </div>
                        </div>
                      </div>
                      <h2 className="mt-3 line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary">{book.book_title}</h2>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{book.authors || book.publisher_name || 'Unknown author'}</p>
                    </button>
                  ))}
                </div>

                <nav className="mt-12 flex items-center justify-between border-t border-border/70 pt-5" aria-label="Search result pages">
                  <p className="hidden text-xs font-bold text-muted-foreground sm:block">
                    Page {filters.page} of {totalPages}
                  </p>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      disabled={filters.page <= 1}
                      onClick={() => updateParams({ page: filters.page - 1 })}
                      className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-bold disabled:opacity-30"
                    >
                      <ChevronLeft size={16} /> Previous
                    </button>
                    <button
                      type="button"
                      disabled={filters.page >= totalPages}
                      onClick={() => updateParams({ page: filters.page + 1 })}
                      className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-bold disabled:opacity-30"
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </nav>
              </>
            )}
          </main>
        </div>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-[80] flex lg:hidden">
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setFiltersOpen(false)} />
          <aside className="relative ml-auto h-full w-[min(88vw,360px)] overflow-y-auto border-l border-border bg-card p-6 shadow-2xl custom-scrollbar">
            <button type="button" onClick={() => setFiltersOpen(false)} className="absolute right-4 top-4 rounded-full border border-border p-2 text-muted-foreground" aria-label="Close filters">
              <X size={17} />
            </button>
            {facetPanel}
          </aside>
        </div>
      )}
    </div>
  );
}
