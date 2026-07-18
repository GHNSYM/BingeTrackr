import { ConditionalAppShell } from "@/components/trackr/ConditionalAppShell";

/**
 * /title/[type]/[id] is a public route — shareable links need to preview
 * without auth. Signed-in visitors keep the app chrome; anonymous ones
 * get the bare title page with the "sign up to track" CTA.
 */
export default function TitleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConditionalAppShell>{children}</ConditionalAppShell>;
}
