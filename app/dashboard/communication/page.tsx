import { redirect } from "next/navigation";

/** Old URL; SMS dashboard lives at /dashboard/sms */
export default function CommunicationRedirectPage() {
  redirect("/dashboard/sms");
}
