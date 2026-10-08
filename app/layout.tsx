export const metadata = {
  title: 'EAN Lookup',
  description: 'Sök och hantera EAN-koder',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sv">
      <body style={{ margin: 0, padding: 0, fontFamily: 'sans-serif', backgroundColor: '#f8fafc' }}>
        {children}
      </body>
    </html>
  )
}