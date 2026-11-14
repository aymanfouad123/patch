import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Patch",
  description: "Run verified coding agents from your live applications.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }

  if (!process.env.NEXT_PUBLIC_CONVEX_SITE_URL) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_SITE_URL");
  }

  const { getToken } = await import("@/lib/auth-server");
  const { ConvexClientProvider } = await import("./convex-client-provider");

  const token = await getToken();

  return (
    <html lang="en">
      <body>
        <ConvexClientProvider initialToken={token}>
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
