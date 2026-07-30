import { AuthForm } from "@/components/auth-form";
import { signIn } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmEmail?: string }>;
}) {
  const { confirmEmail } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Log in to see your combined league matchups.
        </p>
        <AuthForm
          action={signIn}
          mode="login"
          notice={
            confirmEmail
              ? "Check your inbox to confirm your email, then log in."
              : undefined
          }
        />
      </div>
    </div>
  );
}
