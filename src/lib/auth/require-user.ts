import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export const STALE_SESSION_MESSAGE =
  "Your session is out of date — log out and log back in.";

/**
 * Resolves the current session's user id, but also confirms that user still
 * exists in the database. A valid-looking session can outlive its user row
 * (e.g. the JWT hasn't expired yet but the account was deleted), which would
 * otherwise surface as a raw foreign-key crash on the first write.
 */
export async function requireSessionUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true },
  });

  return user ? session.user.id : null;
}
