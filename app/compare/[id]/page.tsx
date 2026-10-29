import { CompareView } from "@/components/compare-view";

export default async function ComparePage({ params }: PageProps<"/compare/[id]">) {
  const { id } = await params;
  return <CompareView id={id} />;
}
