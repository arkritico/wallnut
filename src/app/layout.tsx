import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wallnut - Análise de Projetos de Edifícios em Portugal",
  description:
    "Analise e melhore projetos de edifícios de acordo com a regulamentação portuguesa: REH, RECS, SCIE, RRAE, DL 163/2006, RGEU e SCE.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
