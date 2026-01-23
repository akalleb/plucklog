import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { Providers } from "./providers";
import TopLoadIndicator from "@/components/ui/TopLoadIndicator";
import PageTransition from "@/components/ui/PageTransition";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pluck | Almox",
  description: "Sistema de Gestão de Estoque",
  icons: {
    icon: [
      { url: "/assets/favicons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} soft-app`}>
        <Providers>
          <TopLoadIndicator />
          <div className="flex min-h-screen">
            <Sidebar />
            <PageTransition>{children}</PageTransition>
          </div>
        </Providers>
      </body>
    </html>
  );
}
