// Test setup for client-side tests
// Mocks browser APIs and Colyseus client

import { vi, beforeEach } from 'vitest';

// Mock Canvas 2D context for minimap and other canvas operations
const mockCanvasContext = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'start' as CanvasTextAlign,
  textBaseline: 'alphabetic' as CanvasTextBaseline,
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 10 }),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  createLinearGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  createRadialGradient: vi.fn().mockReturnValue({
    addColorStop: vi.fn(),
  }),
  getImageData: vi.fn().mockReturnValue({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  }),
  putImageData: vi.fn(),
  clip: vi.fn(),
  rect: vi.fn(),
};

// Override HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId: string) => {
  if (contextId === '2d') {
    return mockCanvasContext;
  }
  return null;
});

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
