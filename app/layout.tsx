import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StateDiff",
  description: "Git for the physical world: version control and regression debugging for electronics prototypes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1680px] items-center gap-6 px-5 py-3 lg:px-10">
            <Link href="/" className="flex items-center gap-2.5">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-mono text-lg font-bold text-white">
                ±
              </span>
              <span className="font-[family-name:var(--font-display)] text-xl font-semibold text-label">StateDiff</span>
            </Link>
            <nav className="hidden items-center gap-1 text-sm sm:flex">
              <Link href="/" className="rounded-md px-3 py-1.5 font-medium text-label hover:bg-raised">
                Projects
              </Link>
            </nav>
            <span className="ml-auto hidden text-sm text-muted md:inline">Git for the physical world</span>
            <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-label">local edition</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-5 py-8 lg:px-10">{children}</main>
      </body>
    </html>
  );
}
