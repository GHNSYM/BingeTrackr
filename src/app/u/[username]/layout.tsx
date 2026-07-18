import { ConditionalAppShell } from "@/components/trackr/ConditionalAppShell";

/**
 * /u/[username] is a public route. Signed-in visitors keep their app nav;
 * anonymous strangers get the bare page (they need the sign-up CTA the
 * profile itself renders).
 */
export default function UsernameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConditionalAppShell>{children}</ConditionalAppShell>;
}
