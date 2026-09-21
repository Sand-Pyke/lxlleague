"use client";

import { createContext, useContext } from "react";

export type ViewerUser = {
  id: number;
  username: string;
  /** 界面展示名：核心管理员会换为「超级vip管理员」，普通用户与账号名一致。 */
  displayName: string;
  isAdmin: boolean;
  /** 是否为 admin 核心管理员（运维账号，不参与比赛，与普通管理员区别对待）。 */
  isCoreAdmin: boolean;
  avatar: string;
  /** 自定义背景图地址（`/assets/bgs/*` 或 `/assets/user-bg/*`）；为空表示用默认底色。
   *  背景是全站生效的（深色模式下铺满整个外壳），不只在个人主页。 */
  background: string;
} | null;

const AuthContext = createContext<ViewerUser>(null);

/**
 * 由根布局在服务端注入当前登录用户。
 *
 * 顶栏此前用 useEffect 请求 /api/current_user，初始 state 固定为「未登录」，
 * 因此每次首屏渲染或路由切换重新挂载 LeagueShell 时，都会先渲染出「登录」按钮，
 * 等请求返回后再切换成用户名，表现为右上角闪烁。
 * 改为服务端注入后，首屏 HTML 直接就是正确状态，客户端不再有二次请求。
 */
export function AuthProvider({
  viewer,
  children,
}: {
  viewer: ViewerUser;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={viewer}>{children}</AuthContext.Provider>;
}

/** 读取当前登录用户；未登录时返回 null。 */
export function useViewer() {
  return useContext(AuthContext);
}
