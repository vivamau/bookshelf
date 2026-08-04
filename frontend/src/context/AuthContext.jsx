import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/api';
import {
  clearOfflineBooks,
  clearOfflineFolderMeta,
  clearOfflineUser,
  getOfflineUser,
  saveOfflineUser
} from '../lib/offline';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await authApi.me();
      setUser(res.data);
      await saveOfflineUser(res.data);
    } catch (err) {
      if (!err.response) {
        try {
          setUser(await getOfflineUser());
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = (userData) => {
    setUser(userData);
    saveOfflineUser(userData).catch((err) => console.error('Failed to save offline user metadata', err));
  };

  const logout = async () => {
    try {
        await authApi.logout();
    } catch (err) {
        console.error("Logout failed", err);
    }
    setUser(null);
    try {
      const parsedUser = await getOfflineUser();
      if (parsedUser?.id) {
        Promise.all([
          clearOfflineBooks(parsedUser.id),
          clearOfflineFolderMeta(parsedUser.id)
        ]).catch((err) => console.error('Failed to clear offline books', err));
      }
      await clearOfflineUser();
    } catch (err) {
      console.error('Failed to clear offline user metadata', err);
    }
    localStorage.removeItem('user'); // Cleanup legacy
    localStorage.removeItem('token'); // Cleanup legacy
  };

  // Helper to check roles based on the userrole_id or role information from user object
  const hasPermission = (permission) => {
    if (!user) return false;
    return !!user[permission];
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission, loading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
