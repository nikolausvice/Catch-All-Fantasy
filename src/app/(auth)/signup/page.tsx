import { AuthForm } from "@/components/auth-form";
import { signUp } from "../actions";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Connect leagues from Sleeper, ESPN, and Yahoo in one place.
        </p>
        <AuthForm action={signUp} mode="signup" />
      </div>
    </div>
  );
}
