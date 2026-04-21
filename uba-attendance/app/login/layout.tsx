import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Secure Login',
  description: 'Authenticate with your Vel Tech credentials to access the UBA portal.',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}