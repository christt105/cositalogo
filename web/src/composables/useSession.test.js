import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client.js";
import { createSession } from "./useSession.js";

afterEach(() => vi.restoreAllMocks());

describe("createSession", () => {
  it("knows who is signed in and whether they can write", async () => {
    const session = createSession({ getMe: async () => ({ id: 1, name: "Ana", member: true, admin: false }) });
    expect(session.status.value).toBe("loading");
    await session.refresh();
    expect(session.status.value).toBe("ready");
    expect(session.canWrite.value).toBe(true);
  });

  it("treats a 401 as signed out without logging it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const session = createSession({ getMe: async () => {
      throw new ApiError(401, "sign in first");
    } });
    await session.refresh();
    expect(session.user.value).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("forgets the user on sign out", async () => {
    const logout = vi.fn(async () => null);
    const session = createSession({ getMe: async () => null, logout });
    session.setUser({ id: 1, name: "Ana", member: false, admin: false });
    expect(session.canWrite.value).toBe(false);
    await session.signOut();
    expect(logout).toHaveBeenCalled();
    expect(session.user.value).toBeNull();
  });
});
