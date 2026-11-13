import type { Metadata } from "next";
import { getToken } from "@/lib/auth-server";
import { ConvexClientProvider } from "./convex-client-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Design & development",
  description: "A minimal portfolio demo with Patch, a little space for big ideas.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const token = await getToken();
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider initialToken={token}>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
