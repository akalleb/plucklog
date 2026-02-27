const envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;
const defaultDevBaseUrl = '';
export const API_BASE_URL = (envBaseUrl || defaultDevBaseUrl).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path.startsWith('/') ? path : `/${path}`;
  if (!path) return API_BASE_URL;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? apiUrl(input) : input;
  const token = typeof window !== 'undefined' ? localStorage.getItem('plucklog_token') : null;
  
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Define Content-Type JSON se não for FormData e não tiver definido
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    // Token expirado ou inválido
    if (typeof window !== 'undefined') {
       // Opcional: Redirecionar para login ou limpar token
       // localStorage.removeItem('plucklog_token');
       // localStorage.removeItem('plucklog_user');
       // window.location.href = '/login'; 
    }
  }
  
  return res;
}
