"use client";

import { Checkbox, Modal, Radio, Space, Typography, message } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const POSITIONS = ["TOP", "JUG", "MID", "ADC", "SUP"] as const;
const POSITION_LABELS: Record<string, string> = {
  TOP: "上单",
  JUG: "打野",
  MID: "中单",
  ADC: "射手",
  SUP: "辅助",
};

const isPosition = (value: string): value is (typeof POSITIONS)[number] =>
  (POSITIONS as readonly string[]).includes(value);

type Props = {
  matchId: number;
  /** 赛事处于报名阶段 */
  signable: boolean;
  loggedIn: boolean;
  signed: boolean;
  /** 个人主页默认位置，可能为 FILL（未设置） */
  defaultMain: string;
  defaultSub: string;
};

/** 报名 / 取消报名按钮与选位置弹窗（沿用旧报名弹窗的 main_pos、sub_pos、can_substitute）。 */
export function MatchSignup({ matchId, signable, loggedIn, signed, defaultMain, defaultSub }: Props) {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [mainPos, setMainPos] = useState(isPosition(defaultMain) ? defaultMain : "");
  const [subPos, setSubPos] = useState(isPosition(defaultSub) ? defaultSub : "无");
  const [canSubstitute, setCanSubstitute] = useState(false);

  if (!signable) {
    return <button className="button primary">关注赛事</button>;
  }
  if (!loggedIn) {
    return (
      <Link className="button primary" href="/login">
        登录后报名
      </Link>
    );
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
              onChange={(event) => setMainPos(event.target.value)}
            >
              {POSITIONS.map((position) => (
                <Radio.Button key={position} value={position}>
                  {POSITION_LABELS[position]}
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
              <Radio.Button value="无">无</Radio.Button>
              {POSITIONS.map((position) => (
                <Radio.Button key={position} value={position}>
                  {POSITION_LABELS[position]}
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
