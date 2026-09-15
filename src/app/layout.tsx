import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LSPL 峡谷冠军联赛",
  description: "LSPL 峡谷冠军联赛赛事平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
