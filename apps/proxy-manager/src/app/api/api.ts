import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';

// 定义响应数据接口
interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

// 定义错误响应接口
interface ErrorResponse {
  message: string;
  code: number;
}

// 创建 axios 实例
const instance: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// 响应拦截器
instance.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const { data, code, message } = response.data;
    
    if (code !== 200) {
      return Promise.reject({ message, code });
    }
    
    return data;
  },
  (error: AxiosError<ErrorResponse>) => {
    const message = error.response?.data?.message || '请求失败';
    const code = error.response?.status || 500;
    
    if (code === 401) {
      // 处理未授权
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    
    return Promise.reject({ message, code });
  }
);

// API 方法封装
const api = {
  get: <T>(url: string, params?: object) => 
    instance.get<ApiResponse<T>>(url, { params }),
    
  post: <T>(url: string, data?: object) =>
    instance.post<ApiResponse<T>>(url, data),
    
  put: <T>(url: string, data?: object) =>
    instance.put<ApiResponse<T>>(url, data),
    
  delete: <T>(url: string, params?: object) =>
    instance.delete<ApiResponse<T>>(url, { params }),
    
  patch: <T>(url: string, data?: object) =>
    instance.patch<ApiResponse<T>>(url, data),
};

export default api;