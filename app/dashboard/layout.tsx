import { AuthGate } from "@/components/photographer/auth-gate";
import { PhotographerShell } from "@/components/photographer/photographer-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <PhotographerShell>{children}</PhotographerShell>
    </AuthGate>
  );
}
