// Stateful in-memory AsyncStorage mock so persistence logic can be tested.
const mockStore = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) =>
      Promise.resolve(mockStore.has(key) ? mockStore.get(key)! : null),
    ),
    setItem: jest.fn((key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      mockStore.delete(key);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      mockStore.clear();
      return Promise.resolve();
    }),
  },
}));

beforeEach(() => {
  mockStore.clear();
});
