import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/api';

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
    } catch (err) {
      // If 401/403 or network error, we are not logged in
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = (userData) => {
    setUser(userData);
    // No localStorage storage for critical data
  };

  const logout = async () => {
    try {
        await authApi.logout();
    } catch (err) {
        console.error("Logout failed", err);
    }
    setUser(null);
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
