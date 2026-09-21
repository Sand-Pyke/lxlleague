"use client";

import {
  LockOutlined,
  LoginOutlined,
  SafetyCertificateOutlined,
  UserAddOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Typography,
  message,
} from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RankLabel } from "@/components/rank-label";
import { REGISTER_RANK_OPTIONS } from "@/lib/admin-options";
import {
  PASSWORD_HINT,
  passwordFormatError,
  USERNAME_HINT,
  usernameCharsetError,
  usernameFormatError,
} from "@/lib/credentials";

type AuthMode = "login" | "register";

type AuthValues = {
  username: string;
  password: string;
  confirmPassword?: string;
  rank?: string;
  captchaAnswer?: string;
};

/**
 * 账户ID 里不允许中文（以及空格、全角符号）。注册走严格规则，登录只拦字符集，
 * 这样历史上带 `.` / `-` 的老账号仍能登录。校验函数直接复用服务端的那一份。
 */
function usernameValidator(mode: AuthMode) {
  return (_rule: unknown, value: unknown) => {
    const username = typeof value === "string" ? value.trim() : "";
    if (!username) return Promise.resolve();
    const error =
      mode === "register" ? usernameFormatError(username) : usernameCharsetError(username);
    return error ? Promise.reject(new Error(error)) : Promise.resolve();
  };
}

function passwordValidator(_rule: unknown, value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (!password) return Promise.resolve();
  const error = passwordFormatError(password);
  return error ? Promise.reject(new Error(error)) : Promise.resolve();
}

/** 段位选项带图标，与站内其它段位展示保持一致。 */
const RANK_ICON_OPTIONS = REGISTER_RANK_OPTIONS.map((option) => ({
  value: option.value,
  label: <RankLabel rank={option.value} />,
}));

export function AuthForm({ mode }: { mode: AuthMode }) {
  const isRegister = mode === "register";
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const refreshCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const response = await fetch("/api/captcha", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || typeof data.question !== "string") throw new Error();
      setCaptchaQuestion(data.question);
    } catch {
      setCaptchaQuestion("");
      setError("验证码加载失败，请稍后重试");
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isRegister) void refreshCaptcha();
  }, [isRegister, refreshCaptcha]);

  async function submit(values: AuthValues) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(isRegister ? "/api/register" : "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? {
                username: values.username.trim(),
                password: values.password,
                rank: values.rank ?? "",
                captchaAnswer: values.captchaAnswer,
              }
            : { username: values.username.trim(), password: values.password },
        ),
      });
      const result = await response.json().catch(() => ({}));
      if (isRegister && result.code === "CAPTCHA_INVALID") void refreshCaptcha();
      if (!response.ok || !result.ok) throw new Error(result.error || "请求失败，请稍后重试");
      if (isRegister) {
        // 注册后账号处于待审核状态、不签发会话，因此回登录页而不是个人主页。
        await messageApi.success(result.message || "注册成功，请等待管理员审核后再登录。", 2);
        router.push("/login");
        router.refresh();
        return;
      }
      // 资料齐全的老用户直接进首页；刚注册/资料没填全的用户先去个人主页补资料。
      // 核心管理员是系统账号，不参赛也不展示报名入口，因此同样直接进首页。
      const toProfile = result.profile_complete === false && result.is_admin !== true;
      await messageApi.success(toProfile ? "登录成功" : "登录成功", 2);
      router.push(toProfile ? "/profile" : "/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请求失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Card className="auth-card" variant="borderless">
        {contextHolder}
        <Space orientation="vertical" size={20} className="auth-card__content">
          <div className="auth-emblem">{isRegister ? <UserAddOutlined /> : <LoginOutlined />}</div>
          <div>
            <Typography.Title level={2}>
              {isRegister ? "创建你的召唤师账号" : "欢迎回到峡谷"}
            </Typography.Title>
            <Typography.Paragraph>
              {isRegister
                ? "注册后可维护个人资料、参与赛事并查看赛果。"
                : "登录后继续管理你的赛事资料。"}
            </Typography.Paragraph>
          </div>
          {error && <Alert type="error" showIcon title={error} />}
          <Form layout="vertical" requiredMark={false} onFinish={submit} autoComplete="on">
            <Form.Item
              name="username"
              label="用户名"
              rules={[
                { required: true, message: "请输入用户名" },
                { min: 2, max: 24, message: "用户名长度应为 2 至 24 个字符" },
                { validator: usernameValidator(mode) },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder={USERNAME_HINT}
                size="large"
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: "请输入密码" }, { validator: passwordValidator }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={PASSWORD_HINT}
                size="large"
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </Form.Item>
            {isRegister && (
              <>
                <Form.Item
                  name="confirmPassword"
                  label="确认密码"
                  dependencies={["password"]}
                  rules={[
                    { required: true, message: "请再次输入密码" },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        return !value || getFieldValue("password") === value
                          ? Promise.resolve()
                          : Promise.reject(new Error("两次输入的密码不一致"));
                      },
                    }),
                  ]}
                >
                  <Input.Password
                    prefix={<SafetyCertificateOutlined />}
                    placeholder="再次输入密码"
                    size="large"
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Form.Item name="rank" label="段位（选填）">
                  <Select
                    size="large"
                    allowClear
                    placeholder="选择你的当前段位"
                    options={RANK_ICON_OPTIONS}
                    virtual={false}
                    classNames={{ popup: { root: "rank-dropdown" } }}
                  />
                </Form.Item>
                {/* 段位要按真实水平填写：低段位选手开小号来打会被判炸鱼并处罚。 */}
                <Alert
                  className="auth-rank-notice"
                  type="warning"
                  showIcon
                  title="请如实填写真实段位"
                  description="段位将用于赛事分组与结算，若后续被发现有炸鱼行为，将受到处罚。"
                />
                <Form.Item
                  name="captchaAnswer"
                  label="验证码"
                  rules={[{ required: true, message: "请输入验证码" }]}
                >
                  <div className="captcha-row">
                    <Input placeholder="计算结果" inputMode="numeric" autoComplete="off" />
                    <Button
                      htmlType="button"
                      onClick={() => void refreshCaptcha()}
                      loading={captchaLoading}
                    >
                      {captchaQuestion || "获取验证码"}
                    </Button>
                  </div>
                </Form.Item>
              </>
            )}
            <Button
              htmlType="submit"
              type="primary"
              size="large"
              block
              loading={submitting}
              icon={isRegister ? <UserAddOutlined /> : <LoginOutlined />}
            >
              {isRegister ? "创建账号" : "登录"}
            </Button>
          </Form>
          <Divider plain>{isRegister ? "已有账号？" : "还没有账号？"}</Divider>
          <Link href={isRegister ? "/login" : "/register"}>
            <Button block>{isRegister ? "去登录" : "创建账号"}</Button>
          </Link>
        </Space>
      </Card>
    </main>
  );
}
