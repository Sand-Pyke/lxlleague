"use client";

import { Checkbox, Modal, Radio, Space, Typography, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  NO_SUB_POSITION,
  POSITION_LABEL,
  POSITION_OPTIONS,
  normalizeSubPosition,
  subPositionChoices,
} from "@/lib/admin-options";
import { banNotice } from "@/lib/ban";

const isPosition = (value: string) => POSITION_OPTIONS.includes(value);

const positionLabel = (position: string) => POSITION_LABEL[position] ?? position;

type Props = {
  matchId: number;
  /** 赛事处于报名阶段 */
  signable: boolean;
  loggedIn: boolean;
  signed: boolean;
  /** 是否为 admin 核心管理员（运维账号，不参与比赛） */
  isCoreAdmin: boolean;
  /** 个人主页默认位置，可能为 FILL（未设置） */
  defaultMain: string;
  defaultSub: string;
  /** 处罚截止时间（ISO 字符串）；处罚期内展示提示并禁止报名。 */
  banUntil?: string | null;
  /** 报名前还缺的资料项（空数组 = 资料完善） */
  missingFields: string[];
};

/** 报名 / 取消报名按钮与选位置弹窗（沿用旧报名弹窗的 main_pos、sub_pos、can_substitute）。 */
export function MatchSignup({
  matchId,
  signable,
  loggedIn,
  signed,
  isCoreAdmin,
  defaultMain,
  defaultSub,
  banUntil,
  missingFields,
}: Props) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [mainPos, setMainPos] = useState(isPosition(defaultMain) ? defaultMain : "");
  const [subPos, setSubPos] = useState(isPosition(defaultSub) ? defaultSub : NO_SUB_POSITION);
  const [canSubstitute, setCanSubstitute] = useState(false);

  if (!signable) {
    return <button className="button primary">关注赛事</button>;
  }
  // 核心管理员（admin）是运维账号、不参与比赛，赛事信息里不给报名入口。
  if (isCoreAdmin) return null;
  if (!loggedIn) {
    return (
      <Link className="button primary" href="/login">
        登录后报名
      </Link>
    );
  }
  // 处罚期内直接展示提示，不给报名入口。
  const banText = banNotice(banUntil);
  if (banText) {
    return (
      <div className="signup-blocked">
        <span className="signup-blocked-note">{banText}</span>
      </div>
    );
  }
  // 资料没填全就先不让报名，直接给出补全入口，避免提交后才被服务端拒绝。
  if (missingFields.length) {
    return (
      <div className="signup-blocked">
        <Link className="button primary" href="/profile">
          完善资料后报名
        </Link>
        <span className="signup-blocked-note">报名前需补全：{missingFields.join("、")}</span>
      </div>
    );
  }

  /** 主位置变化时同步刷新副位置：副位置不能与主位置相同。 */
  function selectMain(next: string) {
    setMainPos(next);
    setSubPos((current) => normalizeSubPosition(next, current));
  }

  async function submit() {
    setPending(true);
    try {
      const response = await fetch(`/api/match/signup/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ main_pos: mainPos, sub_pos: subPos, can_substitute: canSubstitute }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "报名失败，请稍后重试");
      await messageApi.success(result.message || "报名成功");
      setOpen(false);
      router.refresh();
    } catch (reason) {
      await messageApi.error(reason instanceof Error ? reason.message : "报名失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  function cancel() {
    Modal.confirm({
      title: "确认取消报名？",
      content: "取消后如需参赛需重新报名并选择位置。",
      okText: "确认取消",
      cancelText: "再想想",
      onOk: async () => {
        const response = await fetch(`/api/match/cancel/${matchId}`, { method: "POST" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          await messageApi.error(result.error || "取消报名失败，请稍后重试");
          return;
        }
        await messageApi.success(result.message || "已取消报名");
        router.refresh();
      },
    });
  }

  return (
    <>
      {contextHolder}
      {signed ? (
        <button className="button ghost" type="button" onClick={cancel}>
          取消报名
        </button>
      ) : (
        <button className="button primary" type="button" onClick={() => setOpen(true)}>
          立即报名
        </button>
      )}
      <Modal
        open={open}
        title="报名参赛"
        okText="确认报名"
        cancelText="取消"
        confirmLoading={pending}
        okButtonProps={{ disabled: !mainPos }}
        onOk={submit}
        onCancel={() => setOpen(false)}
      >
        <Space orientation="vertical" size={0} className="signup-form">
          <Typography.Text className="signup-hint" type="secondary">
            将使用你个人主页设置的昵称报名
          </Typography.Text>
          <div className="signup-field">
            <p className="signup-label">主玩分路</p>
            <Radio.Group
              className="signup-positions"
              value={mainPos}
              onChange={(event) => selectMain(event.target.value)}
            >
              {POSITION_OPTIONS.map((position) => (
                <Radio.Button key={position} value={position}>
                  {positionLabel(position)}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
          <div className="signup-field">
            <p className="signup-label">副玩分路</p>
            <Radio.Group
              className="signup-positions"
              value={subPos}
              onChange={(event) => setSubPos(event.target.value)}
            >
              <Radio.Button value={NO_SUB_POSITION}>无</Radio.Button>
              {/* 主位置选好后，副位置列表里就不再出现它。 */}
              {subPositionChoices(mainPos).map((position) => (
                <Radio.Button key={position} value={position}>
                  {positionLabel(position)}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
          <div className="signup-field">
            <Checkbox
              checked={canSubstitute}
              onChange={(event) => setCanSubstitute(event.target.checked)}
            >
              愿意补位（缺人时可调整位置）
            </Checkbox>
          </div>
        </Space>
      </Modal>
    </>
  );
}
