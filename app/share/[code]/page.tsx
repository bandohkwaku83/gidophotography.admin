import { redirect } from "next/navigation";

type Props = { params: Promise<{ code: string }> };

/**
 * Legacy /share/:code links from the API or old copies redirect to the real route `/g/:token`.
 */
export default async function LegacyShareRedirect({ params }: Props) {
  const { code } = await params;
  redirect(`/g/${encodeURIComponent(code)}`);
}
