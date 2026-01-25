import axios from 'axios';

const API_URL = 'http://localhost:3005/api';

const api = axios.create({
  baseURL: API_URL,
});

// Add interceptor for basic auth or JWT if implemented
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (credentials) => axios.post('http://localhost:3005/login', credentials),
  register: (userData) => axios.post('http://localhost:3005/register', userData),
};

export const booksApi = {
  getAll: () => api.get('/books'),
  getById: (id) => api.get(`/books/${id}`),
  getProgress: (id) => api.get(`/books/${id}/progress`),
  updateProgress: (id, data) => api.post(`/books/${id}/progress`, data),
  create: (data) => api.post('/books', data),
  update: (id, data) => api.put(`/books/${id}`, data),
  delete: (id) => api.delete(`/books/${id}`),
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
  create: (data) => api.post('/generes', data),
};

export const booksGenresApi = {
  create: (data) => api.post('/books-generes', data),
  delete: (id) => api.delete(`/books-generes/${id}`),
};

export const usersApi = {
  getAll: () => api.get('/users'),
};


export default api;
