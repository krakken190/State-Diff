import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StateDiff",
  description: "Git for the physical world: version control and regression debugging for electronics prototypes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="font-mono text-accent">
                ±
              </span>
              StateDiff
            </Link>
            <span className="hidden text-sm text-muted sm:inline">Git for the physical world</span>
            <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-xs text-muted">local edition</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
