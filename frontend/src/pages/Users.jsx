import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Search, 
  MoreHorizontal, 
  Trash2, 
  Pencil, 
  Shield, 
  Mail,
  User as UserIcon,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Camera
} from 'lucide-react';
import { usersApi, rolesApi } from '../api/api';
import { cn, formatDate } from "@/lib/utils";
import { useAuth } from '../context/AuthContext';

export default function Users() {
  const { user, login } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [currentUser, setCurrentUser] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    user_username: '',
    user_email: '',
    user_password: '',
    userrole_id: 3, // Default to guest
    user_name: '',
    user_lastname: '',
    user_avatar: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes] = await Promise.all([
        usersApi.getAll(),
        rolesApi.getAll()
      ]);
      setUsers(usersRes.data.data || []);
      setRoles(rolesRes.data.data || []);
    } catch (err) {
      console.error("Failed to fetch users/roles", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setModalMode('create');
    setFormData({
      user_username: '',
      user_email: '',
      user_password: '',
      userrole_id: 3,
      user_name: '',
      user_lastname: '',
      user_avatar: ''
    });
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (user) => {
    setModalMode('edit');
    setCurrentUser(user);
    setFormData({
      user_username: user.user_username || '',
      user_email: user.user_email || '',
      user_password: '', // Keep empty unless changing
      userrole_id: user.userrole_id || 3,
      user_name: user.user_name || '',
      user_lastname: user.user_lastname || '',
      user_avatar: user.user_avatar || ''
    });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await usersApi.delete(id);
        setUsers(users.filter(u => u.ID !== id));
      } catch (err) {
        console.error("Failed to delete user", err);
        alert('Failed to delete user');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');
    
    try {
      if (modalMode === 'create') {
        await usersApi.create(formData);
      } else {
        await usersApi.update(currentUser.ID, formData);
        // If we are updating ourselves, update the auth context too
        if (user && user.id === currentUser.ID) {
          login({ 
            ...user, 
            ...formData,
            id: user.id, // ensure id stays lowercase
            username: formData.user_username || user.username,
            user_avatar: formData.user_avatar || user.user_avatar
          });
        }
      }
      fetchData();
      setShowModal(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save user');
    } finally {
      setFormLoading(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.user_username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.user_lastname?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-500">
      {/* Header */}
      <div className="px-8 py-6 border-b border-white/5 bg-background/95 backdrop-blur z-20 flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <div className="flex flex-col">
                <h1 className="text-2xl font-black tracking-tight text-foreground">User Management</h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Control access and permissions</p>
            </div>
            <button 
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-black text-xs uppercase tracking-wider transition-all shadow-lg active:scale-95"
            >
                <UserPlus size={16} />
                Create User
            </button>
        </div>

        <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 transition-all"
                />
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <Shield size={14} />
                <span>{users.length} Total Users</span>
            </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
        {loading ? (
            <div className="space-y-4">
                {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
                ))}
            </div>
        ) : (
            <div className="w-full">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-[2px] text-muted-foreground">
                            <th className="py-4 pl-4">User</th>
                            <th className="py-4">Role</th>
                            <th className="py-4 px-4">Permissions</th>
                            <th className="py-4">Joined</th>
                            <th className="py-4 text-right pr-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user.ID} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                <td className="py-4 pl-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border overflow-hidden">
                                           <img src={user.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.user_username}`} alt="Avatar" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm text-foreground">{user.user_username}</span>
                                            <span className="text-xs text-muted-foreground">{user.user_email}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-4">
                                    <span className={cn(
                                        "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                                        user.userrole_name === 'librarian' ? "bg-primary/20 text-primary border border-primary/20" :
                                        user.userrole_name === 'reader' ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                                        "bg-muted text-muted-foreground border border-white/10"
                                    )}>
                                        {user.userrole_name || 'No Role'}
                                    </span>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="flex flex-wrap gap-1.5 max-w-[300px]">
                                        {user.userrole_manageusers ? (
                                            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[9px] font-black uppercase tracking-wider border border-blue-500/20">
                                                Manage Users
                                            </span>
                                        ) : null}
                                        {user.userrole_managebooks ? (
                                            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 text-[9px] font-black uppercase tracking-wider border border-purple-500/20">
                                                Manage Books
                                            </span>
                                        ) : null}
                                        {user.userrole_readbooks ? (
                                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[9px] font-black uppercase tracking-wider border border-emerald-500/20">
                                                Read Books
                                            </span>
                                        ) : null}
                                        {user.userrole_viewbooks ? (
                                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-wider border border-amber-500/20">
                                                View Library
                                            </span>
                                        ) : null}
                                        {!(user.userrole_manageusers || user.userrole_managebooks || user.userrole_readbooks || user.userrole_viewbooks) && (
                                            <span className="text-[10px] text-muted-foreground italic font-medium">No active rights</span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-4 text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                    {formatDate(user.user_create_date)}
                                </td>
                                <td className="py-4 text-right pr-4">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => handleOpenEdit(user)}
                                            className="p-2 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(user.ID)}
                                            className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            
            <div className="relative w-full max-w-4xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                {modalMode === 'create' ? <UserPlus size={24} className="text-primary" /> : <Pencil size={24} className="text-primary" />}
                            </div>
                            <div>
                                <h2 className="text-xl font-black tracking-tight text-foreground">{modalMode === 'create' ? 'Create New User' : 'Edit User Details'}</h2>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-none mt-1">
                                    {modalMode === 'create' ? 'Add a new member to the library' : `Managing ${currentUser?.user_username}`}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
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
                                                <UserIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">{modalMode === 'create' ? 'Password' : 'New Password (leave blank to keep current)'}</label>
                                        <input 
                                            required={modalMode === 'create'}
                                            type="password"
                                            placeholder="••••••••"
                                            value={formData.user_password}
                                            onChange={e => setFormData({...formData, user_password: e.target.value})}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-primary transition-all placeholder:opacity-30"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Avatar & Roles */}
                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1 h-4 bg-primary rounded-full" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground">Identity & Access</span>
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
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Assign Role</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {roles.map(role => (
                                            <div 
                                                key={role.ID} 
                                                onClick={() => setFormData({...formData, userrole_id: role.ID})}
                                                className={cn(
                                                    "relative cursor-pointer flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                                                    formData.userrole_id === role.ID 
                                                        ? "bg-primary/10 border-primary text-primary" 
                                                        : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                                                )}
                                            >
                                                <Shield size={20} className={cn(formData.userrole_id === role.ID ? "text-primary" : "text-muted-foreground/50")} />
                                                <span className="text-[10px] font-black uppercase tracking-wider">{role.userrole_name}</span>
                                                {formData.userrole_id === role.ID && (
                                                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center text-white">
                                                        <Check size={10} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {formData.userrole_id && (
                                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Rights</span>
                                                    <Shield size={14} className="text-primary/50" />
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {roles.find(r => r.ID === formData.userrole_id)?.userrole_manageusers ? (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                            <Check size={10} strokeWidth={3} />
                                                            <span className="text-[9px] font-black uppercase tracking-wider">Manage Users</span>
                                                        </div>
                                                    ) : null}
                                                    {roles.find(r => r.ID === formData.userrole_id)?.userrole_managebooks ? (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                            <Check size={10} strokeWidth={3} />
                                                            <span className="text-[9px] font-black uppercase tracking-wider">Manage Books</span>
                                                        </div>
                                                    ) : null}
                                                    {roles.find(r => r.ID === formData.userrole_id)?.userrole_readbooks ? (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            <Check size={10} strokeWidth={3} />
                                                            <span className="text-[9px] font-black uppercase tracking-wider">Read & Download</span>
                                                        </div>
                                                    ) : null}
                                                    {roles.find(r => r.ID === formData.userrole_id)?.userrole_viewbooks ? (
                                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                            <Check size={10} strokeWidth={3} />
                                                            <span className="text-[9px] font-black uppercase tracking-wider">View Library</span>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-8 border-t border-white/5">
                            <button 
                                type="button" 
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-3.5 px-6 bg-white/5 hover:bg-white/10 text-foreground font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                disabled={formLoading}
                                className="flex-1 py-3.5 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {formLoading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Check className="w-4 h-4" />
                                )}
                                <span>{modalMode === 'create' ? 'Create User Account' : 'Save Changes'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
