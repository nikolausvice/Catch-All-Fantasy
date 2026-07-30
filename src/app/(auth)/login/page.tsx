import { AuthForm } from "@/components/auth-form";
import { signIn } from "../actions";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Welcome back</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Log in to see your combined league matchups.
        </p>
        <AuthForm action={signIn} mode="login" />
      </div>
    </div>
  );
}
