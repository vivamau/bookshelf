import axios from 'axios';

const API_URL = `${import.meta.env.VITE_API_BASE_URL}/api`;

const api = axios.create({
  baseURL: API_URL,
});

// Add request interceptor for JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add response interceptor to handle errors (like 401)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && [401, 403].includes(error.response.status)) {
      // Clear local storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (credentials) => axios.post(`${import.meta.env.VITE_API_BASE_URL}/login`, credentials),
  register: (userData) => axios.post(`${import.meta.env.VITE_API_BASE_URL}/register`, userData),
};

export const booksApi = {
  getAll: (params = {}) => api.get('/books', { params }),
  getContinueReading: () => api.get('/books/continue-reading'),
  getRandom: () => api.get('/books/random'),
  getById: (id) => api.get(`/books/${id}`),
  getProgress: (id) => api.get(`/books/${id}/progress`),
  updateProgress: (id, data) => api.post(`/books/${id}/progress`, data),
  create: (data) => api.post('/books', data),
  upload: (formData) => api.post('/books/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  update: (id, data) => api.put(`/books/${id}`, data),
  delete: (id) => api.delete(`/books/${id}`),
  getReviews: (id) => api.get(`/books/${id}/reviews`),
  setCoverFromUrl: (id, coverUrl) => api.post(`/books/${id}/cover-from-url`, { coverUrl }),
  incrementDownload: (id) => api.post(`/books/${id}/download`),
  getMostRead: () => api.get('/books/most-read'),
  getMostDownloaded: () => api.get('/books/most-downloaded'),
};

export const authorsApi = {
  getAll: () => api.get('/authors'),
  getById: (id) => api.get(`/authors/${id}`),
  getBooks: (id) => api.get(`/authors/${id}/books`),
  create: (data) => api.post('/authors', data),
  update: (id, data) => api.put(`/authors/${id}`, data),
  delete: (id) => api.delete(`/authors/${id}`),
};

export const rolesApi = {
  getAll: () => api.get('/userroles'),
};

export const genresApi = {
  getAll: () => api.get('/generes'),
  getWithBooks: () => api.get('/generes/with-books'),
  getById: (id) => api.get(`/generes/${id}`),
  getBooks: (id) => api.get(`/generes/${id}/books`),
  create: (data) => api.post('/generes', data),
};

export const booksGenresApi = {
  create: (data) => api.post('/books-generes', data),
  delete: (id) => api.delete(`/books-generes/${id}`),
};

export const booksAuthorsApi = {
  getAll: () => api.get('/books-authors'),
  create: (data) => api.post('/books-authors', data),
  delete: (id) => api.delete(`/books-authors/${id}`),
};

export const libraryApi = {
  scan: () => api.get('/library/scan'),
};

export const publishersApi = {
  getAll: () => api.get('/publishers'),
  getById: (id) => api.get(`/publishers/${id}`),
  getBooks: (id) => api.get(`/publishers/${id}/books`),
  create: (data) => api.post('/publishers', data),
  update: (id, data) => api.put(`/publishers/${id}`, data),
  delete: (id) => api.delete(`/publishers/${id}`),
};

export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const reviewsApi = {
  getAll: () => api.get('/reviews'),
  getById: (id) => api.get(`/reviews/${id}`),
  create: (data) => api.post('/reviews', data),
  update: (id, data) => api.put(`/reviews/${id}`, data),
  delete: (id) => api.delete(`/reviews/${id}`),
};

export const settingsApi = {
  getDirectories: () => api.get('/settings/directories'),
  addDirectory: (path) => api.post('/settings/directories', { path }),
  deleteDirectory: (id) => api.delete(`/settings/directories/${id}`),
  browseFilesystem: (path) => api.get('/settings/browse', { params: { path } }),
};


export const searchApi = {
  search: (query) => api.get('/search', { params: { q: query } }),
};

export default api;
