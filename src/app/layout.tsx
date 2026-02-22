import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wallnut - Análise de Projetos de Edifícios em Portugal",
  description:
    "Analise e melhore projetos de edifícios de acordo com a regulamentação portuguesa: REH, RECS, SCIE, RRAE, DL 163/2006, RGEU e SCE.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.jpg",
    apple: "/webclip.jpg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Wallnut",
  },
  openGraph: {
    title: "Wallnut - Regulamentação Portuguesa de Edifícios",
    description: "Verifique a conformidade do seu projeto com 18 especialidades regulamentares portuguesas num só passo. REH, SCIE, RRAE, RTIEBT, DL 163/2006 e mais.",
    type: "website",
    locale: "pt_PT",
    siteName: "Wallnut",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wallnut - Regulamentação Portuguesa de Edifícios",
    description: "Análise completa de conformidade regulamentar para projetos de edifícios em Portugal.",
  },
};

export const viewport: Viewport = {
  themeColor: "#4d65ff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <head />
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
