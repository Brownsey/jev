import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev — entity resolution, record by record",
  description:
    "Explore UK and German project records, compare structured decisions, and inspect the evidence behind proposed entity groups.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
