import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RELAY — Disaster Response Routing",
  description: "Real-time Hindi voice triage and resource dispatch for mass-care events",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
