import { computed, inject, provide, ref, shallowRef } from "vue";
import { getMe, logout } from "../api/session.js";

const SESSION = Symbol("session");

/**
 * Who is signed in: `user` is null or `{ id, name, member, admin }`, and
 * `status` is `loading` until the first answer. `refresh()` asks the API
 * again, `setUser()` takes a user the API already returned (after signing
 * in or unlocking) and `signOut()` ends the session.
 */
export function createSession(api = { getMe, logout }) {
  const user = shallowRef(null);
  const status = ref("loading");
  const canWrite = computed(() => Boolean(user.value?.member));

  async function refresh() {
    try {
      user.value = await api.getMe();
    } catch (err) {
      if (err.status !== 401) console.error("Could not check the session", err);
      user.value = null;
    }
    status.value = "ready";
  }

  function setUser(next) {
    user.value = next;
    status.value = "ready";
  }

  async function signOut() {
    await api.logout();
    user.value = null;
  }

  return { user, status, canWrite, refresh, setUser, signOut };
}

/** Creates the session for the calling component and everything below it, and checks it. */
export function provideSession(session = createSession()) {
  provide(SESSION, session);
  session.refresh();
  return session;
}

/** The session provided by an ancestor with `provideSession`. */
export function useSession() {
  const session = inject(SESSION, null);
  if (!session) throw new Error("useSession() needs provideSession() in an ancestor");
  return session;
}
