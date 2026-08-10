const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

export const api = {
  listComplaints: () => request("/api/complaints"),

  listEstablishments: () => request("/api/establishments"),

  createComplaint: (payload) =>
    request("/api/complaints", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateComplaint: (id, payload) =>
    request(`/api/complaints/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  generateCitizenMessage: (id) =>
    request(`/api/complaints/${id}/citizen-message`, {
      method: "POST",
    }),
};