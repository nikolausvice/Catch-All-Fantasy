import Link from "next/link";

export const GITHUB_URL = "https://github.com/nikolausvice/Catch-All-Fantasy";

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-6 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <p>Not affiliated with Sleeper or ESPN.</p>
        <div className="flex items-center gap-4">
          <Link href="/faq" className="hover:text-foreground hover:underline">
            FAQ
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground hover:underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
