import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docsyra",
  description: "A knowledge management and documentation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="antialiased bg-[#f7f6f3] text-slate-800">
        {children}
      </body>
    </html>
  );
}
