import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Westbound Studios",
  description: "Production dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="brand">Westbound Studios</div>
          <nav className="nav">
            <a href="/">Pipeline</a>
            <a href="/review">Review</a>
            <a href="/revenue">Revenue</a>
            <a href="/calendar">Calendar</a>
            <a href="/errors">Errors</a>
            <a href="/ops">Ops</a>
          </nav>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
