// Central place for talking to the backend.
// Change VITE_API_URL in .env if the API runs somewhere other than localhost:5000.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

/**
 * Wraps fetch with the API base URL, JSON headers, and the saved auth token.
 * If the server says the token is invalid/expired (401), the saved session
 * is cleared and the page reloads back to the login screen.
 */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // A 401 only means "your session expired" if we actually sent a token.
  // A failed login/register attempt also returns 401, but has no token
  // to begin with — that should show an inline error, not reload the page.
  if (response.status === 401 && token) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
    throw new Error("Session expired, please log in again");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // no JSON body
  }

  if (!response.ok) {
    throw new Error(data?.message || "Something went wrong");
  }

  return data;
}

export { API_BASE };
