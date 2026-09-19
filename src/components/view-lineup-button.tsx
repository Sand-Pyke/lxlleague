"use client";

import Link from "next/link";
import { message } from "antd";

/** 「查看对阵」按钮：队伍编排未完成（不足 2 队）时提示，不跳转。 */
export function ViewLineupButton({
  matchId,
  teamCount,
}: {
  matchId: number;
  teamCount: number;
}) {
  const [messageApi, contextHolder] = message.useMessage();

  if (teamCount >= 2) {
    return (
      <Link className="button ghost" href={`/matches/${matchId}/lineup`}>
        查看对阵
      </Link>
    );
  }

  return (
    <>
      {contextHolder}
      <button
        type="button"
        className="button ghost"
        onClick={() => messageApi.info("当前还没有完成队伍编排，至少需要 2 支队伍")}
      >
        查看对阵
      </button>
    </>
  );
}
