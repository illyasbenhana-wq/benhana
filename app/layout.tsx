// Favicon: app/icon.svg (Next.js Metadata Files convention) — the same
// mark used in Logo.tsx, kept as a single static asset since the icon
// needs to exist before React ever runs.
export const metadata = {
  title: 'EthosFi',
  description: 'Financial intelligence infrastructure for responsible credit decisions.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
