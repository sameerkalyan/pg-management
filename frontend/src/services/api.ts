import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    if (error.response?.status === 403 && error.response?.data?.message?.includes('subscription')) {
      window.location.href = '/subscription-payment';
    }
    if (error.response?.status === 403 && error.response?.data?.message?.includes('pending admin approval')) {
      window.location.href = '/pending-approval';
    }
    return Promise.reject(error);
  },
);
