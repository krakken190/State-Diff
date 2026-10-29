import { CheckpointView } from "@/components/checkpoint-view";

export default async function CheckpointPage({ params }: PageProps<"/checkpoints/[id]">) {
  const { id } = await params;
  return <CheckpointView id={id} />;
}
