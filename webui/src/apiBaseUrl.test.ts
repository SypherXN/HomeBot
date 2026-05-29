import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getApiBaseUrl,
  resetApiBaseUrlToDefault,
  setApiBaseUrl,
} from "./apiBaseUrl";

describe("apiBaseUrl", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:5050");
    resetApiBaseUrlToDefault();
  });

  it("normalizes trailing slashes on set", () => {
    setApiBaseUrl("http://192.168.1.10:5050///");
    expect(getApiBaseUrl()).toBe("http://192.168.1.10:5050");
  });

  it("persists override in localStorage", () => {
    setApiBaseUrl("http://lan-host:5050");
    resetApiBaseUrlToDefault();
    expect(getApiBaseUrl()).toBe("http://localhost:5050");
    setApiBaseUrl("http://lan-host:5050");
    expect(getApiBaseUrl()).toBe("http://lan-host:5050");
  });
});
