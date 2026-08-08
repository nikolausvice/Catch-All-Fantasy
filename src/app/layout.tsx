import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catch All Fantasy",
  description:
    "Connect your Sleeper, ESPN, and Yahoo fantasy football leagues and see exactly what every player needs to do to win across all of them at once.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#25262b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The theme class is applied client-side by next-themes before paint
      // (via a blocking inline script it injects), based on the stored
      // preference or the OS setting — suppressHydrationWarning stops React
      // from complaining that the class it sees on hydration doesn't match
      // whatever was server-rendered here.
      suppressHydrationWarning
      // overscroll-y-none — html is the real scrolling element (body no
      // longer establishes its own scroll container, see the overflow-x
      // comment below), so this is where rubber-band bounce past the top/
      // bottom edge needs to be suppressed. Without it, dragging past the
      // end of the page lets iOS Safari's compositor re-layer the stacked
      // sticky header/tabs/filter bar mid-bounce, which is what was
      // producing the stale/ghosted sticky content near the bottom of a
      // long scroll.
      className={`${GeistSans.variable} ${GeistMono.variable} h-full overscroll-y-none antialiased`}
    >
      {/* overflow-x-clip, not overflow-x-hidden — hidden forces the other
          axis (overflow-y) to compute as auto per the CSS overflow spec,
          which turns body itself into a scrolling container instead of
          letting the viewport scroll naturally. On mobile Safari that's a
          known trigger for broken/glitchy position: sticky (the header
          detaching while scrolling, stale sticky content ghosting through
          near scroll boundaries) — clip avoids the side effect while still
          preventing horizontal overflow. */}
      <body className="flex min-h-full flex-col overflow-x-clip">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
