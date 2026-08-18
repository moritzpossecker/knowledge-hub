import type { Metadata } from "next";
import { Rubik, Geist_Mono } from "next/font/google";
import { Toaster } from "@/src/components/ui/sonner";
import { ThemeProvider } from "@/src/components/theme-provider";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Knowledge Hub",
  description: "Chat with your indexed documentation",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${rubik.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" forcedTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
