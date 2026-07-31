import { redirect } from "next/navigation";

// /dashboard/intel was merged into /dashboard (as the Overview sub-tab).
// Kept as a redirect so old bookmarks/links don't just 404.
export default function IntelRedirect() {
  redirect("/dashboard");
}
