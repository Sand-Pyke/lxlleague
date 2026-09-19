"use client";

import { useEffect, useState } from "react";

type MatchStatus = "CREATED" | "LIVE" | "FINISHED";

type Props = {
  /** 排期时间（ISO 字符串），可为空。 */
  target: string | null;
  status: MatchStatus;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** 把剩余毫秒拆成 天/时/分/秒。 */
function parts(diffMs: number) {
  const total = Math.max(0, Math.floor(diffMs / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * 比赛倒计时：报名阶段（CREATED）且有排期时间时，按秒倒计时到开赛时刻。
 * 未设置时间显示「时间待定」，已开始/已结束显示对应状态。
 */
export function MatchCountdown({ target, status }: Props) {
  // 初始为 null：SSR 首屏不渲染具体倒计时，挂载后再起秒表，避免 hydration 不一致。
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (status !== "CREATED") {
    // 开赛/结束后左侧已有状态标识，这里直接隐藏，避免重复展示状态。
    return null;
  }

  if (!target) {
    return (
      <div className="match-countdown">
        <span className="countdown-note">时间待定</span>
      </div>
    );
  }

  if (now === null) return <div className="match-countdown" />;

  const diff = new Date(target).getTime() - now;
  if (diff <= 0) {
    return (
      <div className="match-countdown">
        <span className="countdown-note">等待开赛</span>
      </div>
    );
  }

  const { days, hours, minutes, seconds } = parts(diff);
  return (
    <div className="match-countdown">
      {days > 0 ? (
        <span className="countdown-unit">
          <b>{days}</b>天
        </span>
      ) : null}
      <span className="countdown-unit">
        <b>{pad(hours)}</b>时
      </span>
      <span className="countdown-unit">
        <b>{pad(minutes)}</b>分
      </span>
      <span className="countdown-unit">
        <b>{pad(seconds)}</b>秒
      </span>
    </div>
  );
}
