import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../api/api';
import { BookOpen, User, Lock, Mail } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Login() {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        const res = await authApi.register(formData);
        login(res.data);
      } else {
        const res = await authApi.login({ username: formData.username, password: formData.password });
        login(res.data);
      }
    } catch (err) {
      setError(err.response?.data || 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen w-full bg-brand-darker flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-8 flex flex-col items-center">
        <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center text-primary-foreground mb-6 shadow-lg shadow-primary/20">
          <BookOpen size={32} strokeWidth={2.5} />
        </div>
        
        <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome to Bookshelf</h1>
        <p className="text-muted-foreground text-sm mb-8">
          {isRegister ? 'Create an account to start reading' : 'Sign in to access your library'}
        </p>

        {error && (
          <div className="w-full p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded mb-6 animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text" 
              placeholder="Username"
              required
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              className="w-full bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-md py-2.5 pl-10 pr-4 text-sm outline-none transition-all"
            />
          </div>

          {isRegister && (
            <div className="relative animate-in slide-in-from-top-2 duration-300">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input 
                type="email" 
                placeholder="Email Address"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-md py-2.5 pl-10 pr-4 text-sm outline-none transition-all"
              />
            </div>
          )}

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="password" 
              placeholder="Password"
              required
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              className="w-full bg-secondary/50 border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-md py-2.5 pl-10 pr-4 text-sm outline-none transition-all"
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2.5 rounded-md mt-4 shadow-lg shadow-primary/10 transition-all active:scale-[0.98]"
          >
            {isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-border w-full flex flex-col items-center">
          <p className="text-sm text-muted-foreground">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}
            <button 
              onClick={() => setIsRegister(!isRegister)}
              className="ml-2 text-primary font-bold hover:underline"
            >
              {isRegister ? 'Log In' : 'Sign Up'}
            </button>
          </p>
          
          <div className="mt-6 flex flex-col items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold leading-none mb-1">Quick Access (Real Users)</span>
            <div className="flex gap-2">
                <button 
                    onClick={() => {
                        setFormData({ username: 'guest1', password: 'guestpassword' });
                        setTimeout(() => document.querySelector('button[type="submit"]').click(), 100);
                    }} 
                    className="text-[10px] px-2 py-1 bg-secondary rounded hover:bg-primary hover:text-primary-foreground transition-all uppercase font-bold"
                >
                    Guest
                </button>
                <button 
                    onClick={() => {
                        setFormData({ username: 'reader1', password: 'readerpassword' });
                        setTimeout(() => document.querySelector('button[type="submit"]').click(), 100);
                    }} 
                    className="text-[10px] px-2 py-1 bg-secondary rounded hover:bg-primary hover:text-primary-foreground transition-all uppercase font-bold"
                >
                    Reader
                </button>
                <button 
                    onClick={() => {
                        setFormData({ username: 'admin', password: 'adminpassword' });
                        setTimeout(() => document.querySelector('button[type="submit"]').click(), 100);
                    }} 
                    className="text-[10px] px-2 py-1 bg-secondary rounded hover:bg-primary hover:text-primary-foreground transition-all uppercase font-bold"
                >
                    Librarian
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
