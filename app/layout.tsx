import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poster demo, running on Runpod Serverless",
  description: "A five-minute, meetup-ready demonstration of GPU serverless scaling.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
