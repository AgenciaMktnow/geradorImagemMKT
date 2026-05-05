const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
export const FILE_BASE_URL = API_URL.replace(/\/api\/?$/, "");

let token = localStorage.getItem("studio_token");

export function setToken(nextToken) {
  token = nextToken;
  if (nextToken) localStorage.setItem("studio_token", nextToken);
  else localStorage.removeItem("studio_token");
}

export function getToken() {
  return token;
}

async function request(path, options = {}) { 
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Erro inesperado");
  return data;
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/auth/me"),
  listProjects: () => request("/projects"),
  createProject: (payload) => request("/projects", { method: "POST", body: JSON.stringify(payload) }),
  listPresets: () => request("/presets"),
  createPreset: (payload) => request("/presets", { method: "POST", body: JSON.stringify(payload) }),
  listGenerations: (projectId) => request(`/generations${projectId ? `?projectId=${projectId}` : ""}`),
  getGeneration: (id) => request(`/generations/${id}`),
  createGeneration: (formData) => request("/generations", { method: "POST", body: formData }),
  createBannerUnfold: (formData) => request("/generations/banner-unfold", { method: "POST", body: formData }),
  deleteGeneration: (id) => request(`/generations/${id}`, { method: "DELETE" }),
  unfoldGeneration: (id, presetIds) => request(`/generations/${id}/unfold`, {
    method: "POST",
    body: JSON.stringify({ presetIds })
  }),
  regenerateBase: (id) => request(`/generations/${id}/regenerate-base`, { method: "POST", body: JSON.stringify({}) }),
  regenerateResult: (generationId, resultId) => request(`/generations/${generationId}/results/${resultId}/regenerate`, {
    method: "POST",
    body: JSON.stringify({})
  }),
  deleteResult: (generationId, resultId) => request(`/generations/${generationId}/results/${resultId}`, { method: "DELETE" }),
  retryJob: (id) => request(`/jobs/${id}/retry`, { method: "POST", body: JSON.stringify({}) })
};
