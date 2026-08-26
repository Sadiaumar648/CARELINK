import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareLink API",
  description: "CareLink backend — API routes only, no rendered pages.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
