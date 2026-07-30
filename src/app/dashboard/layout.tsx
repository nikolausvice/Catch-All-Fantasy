import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "../(auth)/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Catch All Fantasy
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <ThemeToggle />
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
