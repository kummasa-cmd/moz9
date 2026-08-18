import { notFound } from "next/navigation";
import { getPublishedNewsletterBySlug } from "@/lib/newsletter/queries";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function NewsletterDebug3Page({ params }: Props) {
  const { slug } = await params;
  const newsletter = await getPublishedNewsletterBySlug(slug);
  if (!newsletter) notFound();

  return <div>FOUND: {newsletter.title}</div>;
}
