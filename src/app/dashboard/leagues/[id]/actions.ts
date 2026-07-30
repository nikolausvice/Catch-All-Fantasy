"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { connectedLeagues } from "@/db/schema";

export async function setUserTeam({
  leagueRowId,
  teamId,
  teamName,
}: {
  leagueRowId: string;
  teamId: string;
  teamName: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");

  await db
    .update(connectedLeagues)
    .set({ userTeamId: teamId, userTeamName: teamName })
    .where(
      and(
        eq(connectedLeagues.id, leagueRowId),
        eq(connectedLeagues.userId, session.user.id),
      ),
    );

  revalidatePath(`/dashboard/leagues/${leagueRowId}`);
  revalidatePath("/dashboard");
}
