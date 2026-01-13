// Test setup for client-side tests
// Mocks browser APIs and Colyseus client

import { vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    hostname: 'localhost',
    host: 'localhost:5173',
    href: 'http://localhost:5173',
    protocol: 'http:',
  },
  writable: true,
});

// Reset mocks before each test
beforeEach(() => {
  localStorageMock.store = {};
  vi.clearAllMocks();
});
