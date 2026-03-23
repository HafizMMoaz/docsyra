import type { User } from "@/types";

type SessionResponse = {
  user?: User | null;
};

export async function getSession(): Promise<User | null> {
  try {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as SessionResponse;
    return data.user ?? null;
  } catch {
    return null;
  }
}
