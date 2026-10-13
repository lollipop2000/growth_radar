import { IntegrationReport } from "@/components/integration-report";
export const dynamic = "force-dynamic";
export default async function Metrika({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  return (
    <IntegrationReport source="METRIKA" period={(await searchParams).period} />
  );
}
