"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  ["/", "首页"],
  ["/matches", "比赛"],
  ["/players", "选手"],
  ["/rankings", "排行"],
  ["/profile", "个人"],
];

export function LeagueShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [user, setUser] = useState<{
    login: boolean;
    username?: string;
    is_admin?: boolean;
  }>({ login: false });
  useEffect(() => {
    fetch("/api/current_user")
      .then((r) => r.json())
      .then(setUser)
      .catch(() => undefined);
  }, []);
  return (
    <div className="page-wrap">
      <header className="nav shell">
        <Link href="/" className="brand">
          LSPL 峡谷冠军联赛
        </Link>
        <nav>
          {links.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="account">
          {user.login ? (
            <>
              <span className="online-dot" />
              {user.username}
              <Link href="/admin" className="admin-link">
                ⚙ 后台
              </Link>
            </>
          ) : (
            <Link href="/profile" className="login-link">
              登录 / 注册
            </Link>
          )}
        </div>
      </header>
      <main className="shell content">{children}</main>
    </div>
  );
}

export function Status({ status }: { status: string }) {
  const label = status === "LIVE" ? "进行中" : status === "FINISHED" ? "已结束" : "即将开始";
  return <span className={`status ${status.toLowerCase()}`}>{label}</span>;
}
