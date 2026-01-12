const envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;
const defaultDevBaseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000';
export const API_BASE_URL = (envBaseUrl || defaultDevBaseUrl).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path.startsWith('/') ? path : `/${path}`;
  if (!path) return API_BASE_URL;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
