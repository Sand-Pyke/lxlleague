"use client";

import { DeleteOutlined, EditOutlined, MessageOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Input, Popconfirm, Space, Typography, message } from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { errorText } from "@/components/admin/api-client";
import { useViewer } from "@/components/auth-provider";

type Comment = { id: number; content: string; created_at: string };
type Post = Comment & { comments: Comment[] };
type ReplyTarget = { postId: number; targetId: number };

const MAX_PREVIEW_COMMENTS = 5;

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

function Avatar({ variant = "comment" }: { variant?: "post" | "comment" }) {
  return (
    <span className={`community-avatar${variant === "post" ? " community-avatar--post" : ""}`}>
      <UserOutlined />
    </span>
  );
}

export function CommunityCard() {
  const viewer = useViewer();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Set<number>>(new Set());

  function browserId() {
    const key = "lxl-community-browser-id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/community", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.msg || "读取社区失败");
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setCanDelete(Boolean(data.can_delete));
    } catch (error) {
      message.error(errorText(error, "读取社区失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 未登录不允许发帖/评论：提示并跳转登录页。 */
  function requireLogin() {
    if (viewer) return true;
    message.info("请先登录后再发帖");
    router.push("/login");
    return false;
  }

  function toggleExpanded(postId: number) {
    setExpandedPosts((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  async function submitPost() {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/community", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Community-Browser-Id": browserId(),
        },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.msg || "发布失败");
      setContent("");
      setEditorOpen(false);
      setReplyTo(null);
      await load();
    } catch (error) {
      message.error(errorText(error, "发布失败"));
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(postId: number) {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/community", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Community-Browser-Id": browserId(),
        },
        body: JSON.stringify({ content, parentId: postId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.msg || "发布失败");
      setContent("");
      setReplyTo(null);
      setExpandedPosts((current) => new Set(current).add(postId));
      await load();
    } catch (error) {
      message.error(errorText(error, "发布失败"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/community/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.msg || "删除失败");
      setPosts((items) =>
        items
          .filter((post) => post.id !== id)
          .map((post) => ({ ...post, comments: post.comments.filter((item) => item.id !== id) }))
      );
    } catch (error) {
      message.error(errorText(error, "删除失败"));
    } finally {
      setBusy(false);
    }
  }

  function replyEditorFor(target: ReplyTarget) {
    return (
      <Space orientation="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 4 }}
          maxLength={500}
          showCount
          placeholder="写下你的评论..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <Space>
          <Button
            size="small"
            type="primary"
            loading={busy}
            disabled={!content.trim()}
            onClick={() => void submitReply(target.postId)}
          >
            发布
          </Button>
          <Button size="small" onClick={() => setReplyTo(null)}>
            取消
          </Button>
        </Space>
      </Space>
    );
  }

  function itemMeta(item: Comment, isPost: boolean, postId: number) {
    return (
      <div className="community-item-meta">
        <span className="community-item-time">{dateText(item.created_at)}</span>
        <div className="community-item-actions">
          <Button
            type="text"
            size="small"
            icon={<MessageOutlined />}
            disabled={busy}
            onClick={() => {
              if (!requireLogin()) return;
              setEditorOpen(false);
              setReplyTo((current) =>
                current?.targetId === item.id ? null : { postId, targetId: item.id }
              );
            }}
          >
            {isPost ? "评论" : "回复"}
          </Button>
          {canDelete ? (
            <Popconfirm
              title={isPost ? "删除这条帖子？" : "删除这条评论？"}
              okText="确定"
              cancelText="取消"
              onConfirm={() => void remove(item.id)}
            >
              <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={busy} />
            </Popconfirm>
          ) : null}
        </div>
      </div>
    );
  }

  function renderComment(comment: Comment, postId: number) {
    const replying = replyTo?.targetId === comment.id;
    return (
      <article className="community-item" key={comment.id}>
        <Avatar />
        <div className="community-item-body">
          <div className="community-item-author">匿名用户</div>
          <div className="community-comment-content">{comment.content}</div>
          {itemMeta(comment, false, postId)}
          {replying && replyTo ? replyEditorFor(replyTo) : null}
        </div>
      </article>
    );
  }

  function renderPost(post: Post) {
    const showAll = expandedPosts.has(post.id);
    const visibleComments = showAll ? post.comments : post.comments.slice(0, MAX_PREVIEW_COMMENTS);
    const replying = replyTo?.targetId === post.id;
    return (
      <article className="community-post" key={post.id}>
        <div className="community-item community-item--post">
          <Avatar variant="post" />
          <div className="community-item-body">
            <div className="community-item-author">
              匿名用户
              <span className="community-op-badge">楼主</span>
            </div>
            <div className="community-post-content">{post.content}</div>
            {itemMeta(post, true, post.id)}
            {replying && replyTo ? replyEditorFor(replyTo) : null}
          </div>
        </div>
        <div className="community-comments">
          {post.comments.length ? (
            <>
              {visibleComments.map((comment) => renderComment(comment, post.id))}
              {post.comments.length > MAX_PREVIEW_COMMENTS ? (
                <div className="community-more">
                  <Button type="text" size="small" onClick={() => toggleExpanded(post.id)}>
                    {showAll ? "收起评论" : `查看更多评论（共 ${post.comments.length} 条）`}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="community-empty">还没有评论，来留下第一条吧</div>
          )}
        </div>
      </article>
    );
  }

  return (
    <Card
      className="antd-panel community-card"
      title="用户社区"
      extra={
        viewer ? (
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="发布新帖"
            title="发布新帖"
            onClick={() => {
              setReplyTo(null);
              setEditorOpen((open) => !open);
            }}
          >
            发帖
          </Button>
        ) : (
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="登录后发帖"
            title="登录后发帖"
            href="/login"
          >
            登录后发帖
          </Button>
        )
      }
    >
      {editorOpen && viewer ? (
        <Space orientation="vertical" size={8} style={{ width: "100%", marginBottom: 16 }}>
          <Input.TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={500}
            showCount
            placeholder="写下你的新帖..."
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <Space>
            <Button
              type="primary"
              size="small"
              loading={busy}
              disabled={!content.trim()}
              onClick={() => void submitPost()}
            >
              发布新帖
            </Button>
            <Button size="small" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
          </Space>
        </Space>
      ) : null}
      {loading ? (
        <Typography.Text type="secondary">加载中...</Typography.Text>
      ) : posts.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有帖子，来发布第一条吧" />
      ) : (
        <div className="community-feed">{posts.map((post) => renderPost(post))}</div>
      )}
    </Card>
  );
}
