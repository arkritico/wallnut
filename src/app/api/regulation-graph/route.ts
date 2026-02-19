import { NextResponse } from "next/server";
import { getAvailablePlugins } from "@/lib/plugins/loader";
import { buildRegulationGraph } from "@/lib/regulation-graph";
import { withApiHandler } from "@/lib/api-error-handler";

export const GET = withApiHandler("regulation-graph", async () => {
  const plugins = getAvailablePlugins();
  const graph = buildRegulationGraph(plugins);
  return NextResponse.json(graph);
});
