/** Shared admin helpers – password stored in sessionStorage */

const AUTH_KEY = 'admin_token';

export function getToken() {
  return sessionStorage.getItem(AUTH_KEY) || '';
}

export function setToken(t) {
  sessionStorage.setItem(AUTH_KEY, t);
}

export function clearToken() {
  sessionStorage.removeItem(AUTH_KEY);
}

export function requireLogin() {
  if (!getToken()) {
    window.location.href = '/admin/login.html';
    return false;
  }
  return true;
}

export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearToken();
    window.location.href = '/admin/login.html';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function shortAddr(a) {
  if (!a) return '—';
  return a.slice(0, 6) + '…' + a.slice(-4);
}

export function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav a').forEach((el) => {
    const href = el.getAttribute('href');
    if (href && path.endsWith(href.replace(/^\/admin\/?/, '') || 'index.html')) {
      el.classList.add('active');
    } else if (href === '/admin/' && (path === '/admin' || path === '/admin/' || path.endsWith('/admin/index.html'))) {
      el.classList.add('active');
    }
  });
}
