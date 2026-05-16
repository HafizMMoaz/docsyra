import type { Metadata } from "next";
import { Fraunces, Spline_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
});

const splineSans = Spline_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700"],
});

const splineSansMono = Spline_Sans_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Docsyra — A focused workspace for collaborative documents",
  description: "A knowledge management and documentation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${splineSans.variable} ${splineSansMono.variable}`}
    >
      <body suppressHydrationWarning className="antialiased">
        {children}
      </body>
    </html>
  );
}
