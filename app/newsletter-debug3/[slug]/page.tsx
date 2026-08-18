import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function NewsletterDebug3Page({ params }: Props) {
  const { slug } = await params;

  const db = createAdminClient();
  const result = await db
    .from("newsletters")
    .select("id, title, slug, status")
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  return (
    <pre style={{ whiteSpace: "pre-wrap", padding: 20 }}>
      {JSON.stringify(
        {
          receivedSlug: slug,
          slugLength: slug.length,
          slugCodePoints: [...slug].map((c) => c.codePointAt(0)?.toString(16)),
          error: result.error,
          found: !!result.data,
          data: result.data,
        },
        null,
        2,
      )}
    </pre>
  );
}
