import { getSleeperNflState } from "@/lib/sleeper/client";

/** Current NFL week, shared across platforms since it's just the calendar week. */
export async function getCurrentNflWeek(): Promise<number> {
  const state = await getSleeperNflState();
  return state.week || state.display_week || 1;
}
