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
  Checkbox,
  Divider,
  Form,
  Input,
  Space,
  Typography,
  message,
} from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AuthMode = "login" | "register";

type AuthValues = {
  username: string;
  password: string;
  confirmPassword?: string;
  agreement?: boolean;
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const isRegister = mode === "register";
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [messageApi, contextHolder] = message.useMessage();

  async function submit(values: AuthValues) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(isRegister ? "/api/register" : "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: values.username.trim(), password: values.password }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "请求失败，请稍后重试");
      await messageApi.success(isRegister ? "注册成功，欢迎加入 LSPL" : "登录成功");
      router.push("/profile");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请求失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Card className="auth-card" bordered={false}>
        {contextHolder}
        <Space direction="vertical" size={20} className="auth-card__content">
          <div className="auth-emblem">{isRegister ? <UserAddOutlined /> : <LoginOutlined />}</div>
          <div>
            <Typography.Text type="secondary">LSPL ACCOUNT</Typography.Text>
            <Typography.Title level={2}>
              {isRegister ? "创建你的召唤师账号" : "欢迎回到峡谷"}
            </Typography.Title>
            <Typography.Paragraph>
              {isRegister
                ? "注册后可维护个人资料、参与赛事并查看赛果。"
                : "登录后继续管理你的赛事资料。"}
            </Typography.Paragraph>
          </div>
          {error && <Alert type="error" showIcon message={error} />}
          <Form layout="vertical" requiredMark={false} onFinish={submit} autoComplete="on">
            <Form.Item
              name="username"
              label="用户名"
              rules={[
                { required: true, message: "请输入用户名" },
                { min: 2, max: 24, message: "用户名长度应为 2 至 24 个字符" },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="输入用户名"
                size="large"
                autoComplete="username"
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: "请输入密码" },
                { min: 6, message: "密码至少需要 6 个字符" },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="至少 6 个字符"
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
                <Form.Item
                  name="agreement"
                  valuePropName="checked"
                  rules={[
                    {
                      validator: (_, checked) =>
                        checked
                          ? Promise.resolve()
                          : Promise.reject(new Error("请阅读并同意服务条款")),
                    },
                  ]}
                >
                  <Checkbox>我已阅读并同意服务条款与隐私说明</Checkbox>
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
