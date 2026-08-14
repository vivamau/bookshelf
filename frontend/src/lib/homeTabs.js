const HOME_TABS = Object.freeze([
  { id: 'Explore', label: 'Explore', audience: 'all', selectable: true },
  { id: 'Trending', label: 'Trending', audience: 'all', selectable: true },
  { id: 'Recommended', label: 'Recommended', audience: 'all', selectable: false },
  { id: 'Genres', label: 'Genres', audience: 'all', selectable: true },
  { id: 'Audiobooks', label: 'Audiobooks', audience: 'all', selectable: true },
]);

export const getHomeTabsForRole = (role) => HOME_TABS.filter((tab) => (
  tab.audience === 'all' || tab.audience.includes(role)
));
