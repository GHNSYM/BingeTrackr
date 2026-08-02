import type { Metadata } from "next";
import { Manrope, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BingeTrackr — Never lose your place again",
  // Deliberately does NOT mention friends or recommendations — social is on the
  // v1 OUT list in AGENTS.md. Update this when v1.5 ships it, not before.
  description:
    "Track every movie, show and anime — Bollywood to Busan to shonen. Resume any episode, rank your favourites in a tier list, and never rewatch a season by accident.",
  metadataBase: new URL("https://bingetrackr.app"),
  openGraph: {
    title: "BingeTrackr",
    description: "Never lose your place again.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${manrope.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/*
          Applies the saved theme before the browser paints, so a light-mode user
          never sees a dark flash. `dark` is already on <html> from the server
          (dark is the design system's default), so this only ever REMOVES it —
          dark users get no work and no flash at all.

          It must run synchronously, not in an effect: an effect runs after first
          paint, which is exactly the flash being avoided. `beforeInteractive`
          also guarantees Next injects it into <head> regardless of where it sits
          in this tree, so it runs earlier than a plain <script> here would — and
          it avoids React's "script tag inside a component" warning that a raw
          inline <script> triggers. `id` is required for inline next/script.

          try/catch because localStorage throws outright in some privacy modes.
        */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
