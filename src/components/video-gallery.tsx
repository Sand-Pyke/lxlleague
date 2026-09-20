"use client";

import {
  DeleteOutlined,
  InboxOutlined,
  PlayCircleFilled,
  PlusOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Typography,
  Upload,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { errorText } from "@/components/admin/api-client";
import { useViewer } from "@/components/auth-provider";

type VideoItem = {
  id: number;
  title: string;
  description: string | null;
  size: number;
  created_at: string;
  url: string;
};

const dateText = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const time = date.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `今天 ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.toLocaleString("zh-CN", { month: "long", day: "numeric" })} ${time}`;
  }
  return `${date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })} ${time}`;
};

const formatSize = (bytes: number) => {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/** 视频文件选择器：拖拽/点击选文件，由父组件持有 File 对象，不做自动上传。 */
function VideoFilePicker({ value, onChange }: { value: File | null; onChange: (file: File | null) => void }) {
  return (
    <Upload.Dragger
      accept=".mp4,.webm,video/mp4,video/webm"
      maxCount={1}
      beforeUpload={() => false}
      onChange={(info) => {
        const last = info.fileList[info.fileList.length - 1];
        onChange((last?.originFileObj as File | undefined) ?? null);
      }}
      className="video-upload-dragger"
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">点击或拖拽视频到此处</p>
      <p className="ant-upload-hint">
        支持 mp4 / webm，单个不超过 200MB
        {value ? `（已选择：${value.name}，${formatSize(value.size)}）` : ""}
      </p>
    </Upload.Dragger>
  );
}

export function VideoGallery() {
  const viewer = useViewer();
  const [form] = Form.useForm();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [playing, setPlaying] = useState<VideoItem | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/videos", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.msg || "读取视频列表失败");
      setVideos(Array.isArray(data.videos) ? data.videos : []);
    } catch (error) {
      message.error(errorText(error, "读取视频列表失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openUpload() {
    setFile(null);
    form.resetFields();
    setUploadOpen(true);
  }

  async function submit() {
    const values = (await form.validateFields().catch(() => null)) as {
      title?: string;
      description?: string;
    } | null;
    if (!values || !file) return;
    setPending(true);
    try {
      const body = new FormData();
      body.append("title", values.title ?? "");
      if (values.description) body.append("description", values.description);
      body.append("file", file);
      const response = await fetch("/api/admin/videos", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.msg || "上传失败");
      message.success("视频已发布");
      setUploadOpen(false);
      setFile(null);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(errorText(error, "上传失败"));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: number) {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/videos/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.msg || "删除失败");
      message.success("视频已删除");
      setVideos((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      message.error(errorText(error, "删除失败"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      className="antd-panel video-gallery-card"
      title="比赛视频"
      extra={
        viewer?.isAdmin ? (
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            disabled={pending}
            onClick={openUpload}
          >
            上传视频
          </Button>
        ) : null
      }
    >
      {loading ? (
        <div className="video-gallery-loading">
          <Spin />
        </div>
      ) : videos.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有视频，敬请期待比赛集锦"
        />
      ) : (
        <div className="video-grid">
          {videos.map((video) => (
            <article className="video-card" key={video.id}>
              <button
                type="button"
                className="video-card__cover"
                aria-label={`播放视频：${video.title}`}
                onClick={() => setPlaying(video)}
              >
                <video
                  className="video-card__thumb"
                  src={video.url}
                  preload="metadata"
                  muted
                  playsInline
                />
                <span className="video-card__play" aria-hidden>
                  <PlayCircleFilled />
                </span>
              </button>
              <div className="video-card__body">
                <div className="video-card__title-row">
                  <span className="video-card__icon" aria-hidden>
                    <VideoCameraOutlined />
                  </span>
                  <Typography.Text className="video-card__title" ellipsis>
                    {video.title}
                  </Typography.Text>
                </div>
                {video.description ? (
                  <Typography.Paragraph className="video-card__desc" ellipsis={{ rows: 2 }}>
                    {video.description}
                  </Typography.Paragraph>
                ) : null}
                <div className="video-card__meta">
                  <Space size={10}>
                    <span>{dateText(video.created_at)}</span>
                    <span>{formatSize(video.size)}</span>
                  </Space>
                  {viewer?.isAdmin ? (
                    <Popconfirm
                      title="删除这个视频？"
                      okText="确定"
                      cancelText="取消"
                      onConfirm={() => void remove(video.id)}
                    >
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={pending}
                      />
                    </Popconfirm>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* 播放弹窗：原生播放器控件自带全屏 / 暂停 / 音量等功能。 */}
      <Modal
        className="video-player-modal"
        title={playing?.title}
        open={Boolean(playing)}
        footer={null}
        centered
        width={920}
        destroyOnHidden
        onCancel={() => setPlaying(null)}
      >
        {playing ? (
          <video
            className="video-player-modal__video"
            src={playing.url}
            controls
            autoPlay
            playsInline
          />
        ) : null}
      </Modal>

      {/* 上传弹窗：自定义文件选择组件 + 标题简介表单。 */}
      <Modal
        title="上传视频"
        open={uploadOpen}
        okText="发布"
        cancelText="取消"
        confirmLoading={pending}
        onOk={() => void submit()}
        onCancel={() => setUploadOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="video-upload-form">
          <Form.Item
            name="title"
            label="标题"
            rules={[
              { required: true, message: "请填写标题" },
              { max: 100, message: "标题不能超过 100 个字" },
            ]}
          >
            <Input placeholder="例如：S1 决赛精彩集锦" maxLength={100} showCount />
          </Form.Item>
          <Form.Item
            name="description"
            label="简介（可选）"
            rules={[{ max: 500, message: "简介不能超过 500 个字" }]}
          >
            <Input.TextArea
              placeholder="一句话介绍视频内容"
              maxLength={500}
              showCount
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item label="视频文件" required>
            <VideoFilePicker value={file} onChange={setFile} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
