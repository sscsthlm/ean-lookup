import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "EAN-Ersättningar",
  description: "Spåra och hantera EAN-ersättningar",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
