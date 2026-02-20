import type { Metadata } from "next";
import RegulamentosPage from "@/components/regulamentos/RegulamentosPage";

export const metadata: Metadata = {
  title: "Regulamentos - Wallnut",
  description: "Gestão de regulamentos de construção portuguesa — 18 especialidades, 1.964 regras declarativas",
};

export default function RegulamentosRoute() {
  return <RegulamentosPage />;
}
