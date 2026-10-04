import { useEffect, useState, useCallback } from 'react';

// 极简 hash 路由：#/nurse、#/archive/arc-1、#/archive/arc-1/visit/new
export function useHashRoute(): [string, (to: string) => void] {
  const [path, setPath] = useState(() => window.location.hash.replace(/^#/, '') || '/');
  useEffect(() => {
    const onChange = () => setPath(window.location.hash.replace(/^#/, '') || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((to: string) => {
    window.location.hash = to;
  }, []);
  return [path, navigate];
}

export function parseRoute(path: string): { name: string; params: string[] } {
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] ?? 'home', params: parts.slice(1) };
}
