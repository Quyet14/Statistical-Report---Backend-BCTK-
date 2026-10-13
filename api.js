const API_BASE_URL = 'http://localhost:3010';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

const api = {
  createTask: async (task, accessToken) => {
    return request('/api/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(task),
    });
  },

  getMyTasks: async (accessToken) => {
    return request('/api/tasks/mine', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },

  getNotifications: async (accessToken) => {
    return request('/api/notifications', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },

  markNotificationAsRead: async (notificationId, accessToken) => {
    return request(`/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },

  updateChecklistItem: async (taskId, itemId, completed, accessToken) => {
    return request(`/api/tasks/${taskId}/checklist/${itemId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ completed }),
    });
  },
  createAccount: async (name, email, password, role = 'staff') => {
    return request('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
  },

  login: async (email, password) => {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  verifyLoginOtp: async (email, otp) => {
    return request('/api/auth/verify-login-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
  },

  forgotPassword: async (email) => {
    return request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword: async (email, otp, newPassword) => {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, newPassword }),
    });
  },
};

module.exports = api;

// Example usage:
// const api = require('./api');
//
// api.login('admin@example.com', '123456')
//   .then(console.log)
//   .catch(console.error);
//
// api.verifyLoginOtp('admin@example.com', '456520')
//   .then((res) => {
//     console.log(res);
//     localStorage.setItem('accessToken', res.accessToken);
//     localStorage.setItem('refreshToken', res.refreshToken);
//   })
//   .catch(console.error);
