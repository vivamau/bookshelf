import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Mail, 
  Lock, 
  RefreshCw, 
  Check, 
  AlertCircle,
  Camera,
  Shield
} from 'lucide-react';
import { usersApi } from '../api/api';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

export default function ProfileModal({ isOpen, onClose }) {
  const { user, login } = useAuth();
  const [formData, setFormData] = useState({
    user_username: '',
    user_email: '',
    user_password: '',
    user_name: '',
    user_lastname: '',
    user_avatar: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      // Robustly handle both formats (lowercase 'id'/'username' and camelCase/snake_case)
      const currentId = user.id || user.ID || user.user_id;
      const currentUsername = user.username || user.user_username;
      const currentEmail = user.email || user.user_email;

      setFormData({
        user_username: currentUsername || '',
        user_email: currentEmail || '',
        user_password: '', // Don't pre-fill password
        user_name: user.user_name || '',
        user_lastname: user.user_lastname || '',
        user_avatar: user.user_avatar || ''
      });
      console.log('ProfileModal debug - user:', user);
      setError('');
      setSuccess(false);
    }
  }, [isOpen, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const currentId = user.id || user.ID || user.user_id;
    
    if (!currentId) {
        setError('User ID not found. Please try re-logging.');
        return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await usersApi.update(currentId, formData);
      
      // Update local session
      const updatedUser = { 
        ...user, 
        ...formData,
        username: formData.user_username,
        email: formData.user_email,
        user_avatar: formData.user_avatar
      };
      login(updatedUser);
      
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        
        <div className="relative w-full max-w-4xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                            <User size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight text-foreground">Account Settings</h2>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none mt-1">
                                Update your personal information and profile
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                        <X size={20} className="text-muted-foreground" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-red-500 mb-6">
                            <AlertCircle size={20} />
                            <span className="text-sm font-bold">{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3 text-emerald-500 mb-6 animate-in slide-in-from-top-2">
                            <Check size={20} />
                            <span className="text-sm font-bold">Profile updated successfully!</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* Left Column: General Info */}
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground">General Information</span>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Username</label>
                                        <div className="relative">
                                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <input 
                                                required
                                                type="text"
                                                placeholder="johndoe"
                                                value={formData.user_username}
                                                onChange={e => setFormData({...formData, user_username: e.target.value})}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-primary transition-all placeholder:opacity-30"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email Address</label>
                                        <div className="relative">
                                            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <input 
                                                required
                                                type="email"
                                                placeholder="john@example.com"
                                                value={formData.user_email}
                                                onChange={e => setFormData({...formData, user_email: e.target.value})}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-primary transition-all placeholder:opacity-30"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">First Name</label>
                                        <input 
                                            type="text"
                                            placeholder="John"
                                            value={formData.user_name}
                                            onChange={e => setFormData({...formData, user_name: e.target.value})}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-primary transition-all placeholder:opacity-30"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Last Name</label>
                                        <input 
                                            type="text"
                                            placeholder="Doe"
                                            value={formData.user_lastname}
                                            onChange={e => setFormData({...formData, user_lastname: e.target.value})}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-primary transition-all placeholder:opacity-30"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">New Password (leave blank to keep current)</label>
                                    <div className="relative">
                                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input 
                                            type="password"
                                            placeholder="••••••••"
                                            value={formData.user_password}
                                            onChange={e => setFormData({...formData, user_password: e.target.value})}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-primary transition-all placeholder:opacity-30"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Avatar & Security */}
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1 h-4 bg-primary rounded-full" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground">Profile Identity</span>
                                </div>

                                <div className="flex items-center gap-6 p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <div className="relative group shrink-0">
                                        <div className="w-20 h-20 rounded-2xl bg-muted border-2 border-primary/20 overflow-hidden shadow-2xl transition-transform group-hover:scale-105">
                                            <img 
                                                src={formData.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.user_username || 'default'}`} 
                                                alt="Preview" 
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shadow-lg cursor-pointer hover:scale-110 transition-all border-2 border-card"
                                             onClick={() => {
                                                 const randomSeed = Math.random().toString(36).substring(7);
                                                 const currentStyle = formData.user_avatar?.split('/')[4]?.split('?')[0] || 'avataaars';
                                                 setFormData({...formData, user_avatar: `https://api.dicebear.com/7.x/${currentStyle}/svg?seed=${randomSeed}`});
                                             }}
                                        >
                                            <RefreshCw size={14} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Avatar Style</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {['avataaars', 'bottts', 'pixel-art', 'lorelei', 'adventurer'].map(style => (
                                                <button
                                                    key={style}
                                                    type="button"
                                                    onClick={() => {
                                                        const seed = formData.user_avatar?.split('seed=')[1] || formData.user_username || 'default';
                                                        setFormData({...formData, user_avatar: `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`});
                                                    }}
                                                    className={cn(
                                                        "px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider border transition-all",
                                                        (formData.user_avatar?.includes(style) || (!formData.user_avatar && style === 'avataaars'))
                                                            ? "bg-primary text-primary-foreground border-primary"
                                                            : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                                                    )}
                                                >
                                                    {style.replace('-', ' ')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Current Role & Rights</label>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                            <div className="flex items-center gap-2">
                                                <Shield size={14} className="text-primary" />
                                                <span className="text-[10px] font-black uppercase tracking-widest text-foreground">{user?.userrole_name || 'GUEST'} Access</span>
                                            </div>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-40">Managed by System</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {user?.userrole_manageusers ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                    <Check size={10} strokeWidth={3} />
                                                    <span className="text-[9px] font-black uppercase tracking-wider">Manage Users</span>
                                                </div>
                                            ) : null}
                                            {user?.userrole_managebooks ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                    <Check size={10} strokeWidth={3} />
                                                    <span className="text-[9px] font-black uppercase tracking-wider">Manage Books</span>
                                                </div>
                                            ) : null}
                                            {user?.userrole_readbooks ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    <Check size={10} strokeWidth={3} />
                                                    <span className="text-[9px] font-black uppercase tracking-wider">Read & Download</span>
                                                </div>
                                            ) : null}
                                            {user?.userrole_viewbooks ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    <Check size={10} strokeWidth={3} />
                                                    <span className="text-[9px] font-black uppercase tracking-wider">View Library</span>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4 pt-8 border-t border-white/5">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="flex-1 py-3.5 px-6 bg-white/5 hover:bg-white/10 text-foreground font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="flex-1 py-3.5 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                            {loading ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            <span>Save Profile Changes</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
  );
}
