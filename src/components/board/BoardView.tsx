"use client";

import dynamic from "next/dynamic";
import {
  ChevronLeft,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { getFirebaseClient } from "@/lib/firebase/config";
import type { Comment, Post } from "@/types";
import { PostContent } from "./PostEditor";

const PostEditor = dynamic(() => import("./PostEditor"), { ssr: false });

type BoardViewProps = {
  teamId: string;
  uid: string;
  userName: string;
};

async function uploadImageToCloudinary(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "notices");
  const res = await fetch("https://api.cloudinary.com/v1_1/dmkjbo1vl/image/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("이미지 업로드에 실패했습니다.");
  const data = await res.json();
  return data.secure_url as string;
}

type ViewState = "list" | "detail" | "write" | "edit";

export default function BoardView({ teamId, uid, userName }: BoardViewProps) {
  const [view, setView] = useState<ViewState>("list");
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  // Post form
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  // Real-time post list — 내 팀 공개 게시물만
  useEffect(() => {
    if (!teamId) return;
    const { db } = getFirebaseClient();
    const q = query(
      collection(db, "posts"),
      where("teamId", "==", teamId),
      where("isPublic", "==", true),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post)));
    });
    return () => unsub();
  }, [teamId]);

  // Load comments when entering detail
  useEffect(() => {
    if (view !== "detail" || !selectedPost) return;
    setIsLoadingComments(true);
    const { db } = getFirebaseClient();
    const q = query(
      collection(db, "posts", selectedPost.id, "comments"),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comment)));
      setIsLoadingComments(false);
    });
    return () => unsub();
  }, [view, selectedPost]);

  function openWrite() {
    setEditingPost(null);
    setPostTitle("");
    setPostContent("");
    setView("write");
  }

  function openEdit(post: Post) {
    setEditingPost(post);
    setPostTitle(post.title);
    setPostContent(post.content);
    setView("edit");
  }

  function openDetail(post: Post) {
    setSelectedPost(post);
    setCommentText("");
    setView("detail");
  }

  function goList() {
    setView("list");
    setSelectedPost(null);
    setComments([]);
  }

  async function submitPost() {
    if (!postTitle.trim() || !postContent.trim()) return;
    setIsSubmittingPost(true);
    try {
      const { db } = getFirebaseClient();
      const now = Date.now();
      if (editingPost) {
        await updateDoc(doc(db, "posts", editingPost.id), {
          title: postTitle.trim(),
          content: postContent,
          updatedAt: now,
        });
        const updated = { ...editingPost, title: postTitle.trim(), content: postContent, updatedAt: now };
        setSelectedPost(updated);
        setView("detail");
      } else {
        const newPost: Omit<Post, "id"> = {
          title: postTitle.trim(),
          content: postContent,
          teamId,
          authorId: uid,
          authorName: userName,
          isPublic: true,
          commentCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        const ref = await addDoc(collection(db, "posts"), newPost);
        const created = { id: ref.id, ...newPost };
        setSelectedPost(created);
        setView("detail");
      }
    } catch (err) {
      console.error("[submitPost]", err);
    } finally {
      setIsSubmittingPost(false);
    }
  }

  async function deletePost(post: Post) {
    if (!confirm("게시글을 삭제하시겠습니까?")) return;
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, "posts", post.id));
      goList();
    } catch (err) {
      console.error("[deletePost]", err);
    }
  }

  async function submitComment() {
    if (!commentText.trim() || !selectedPost) return;
    setIsSubmittingComment(true);
    try {
      const { db } = getFirebaseClient();
      const newComment: Omit<Comment, "id"> = {
        postId: selectedPost.id,
        content: commentText.trim(),
        authorId: uid,
        authorName: userName,
        createdAt: Date.now(),
      };
      await addDoc(collection(db, "posts", selectedPost.id, "comments"), newComment);
      await updateDoc(doc(db, "posts", selectedPost.id), { commentCount: increment(1) });
      setCommentText("");
    } catch (err) {
      console.error("[submitComment]", err);
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function deleteComment(comment: Comment) {
    if (!selectedPost) return;
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, "posts", selectedPost.id, "comments", comment.id));
      await updateDoc(doc(db, "posts", selectedPost.id), { commentCount: increment(-1) });
    } catch (err) {
      console.error("[deleteComment]", err);
    }
  }

  // ── List view ──────────────────────────────────────────────
  if (view === "list") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-black">팀 게시판</h3>
            <p className="mt-1 text-sm font-medium text-slate-400">팀원들과 자유롭게 소통하세요.</p>
          </div>
          <button
            onClick={openWrite}
            className="flex cursor-pointer items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            글쓰기
          </button>
        </div>

        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2.5rem] border border-dashed border-slate-200 bg-slate-50 py-20 text-center">
            <p className="text-4xl">📋</p>
            <p className="mt-4 text-sm font-bold text-slate-300">아직 게시글이 없어요</p>
            <p className="mt-1 text-xs text-slate-300">첫 번째 글을 작성해보세요!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => openDetail(post)}
                className="group cursor-pointer rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-base font-black text-slate-900 group-hover:text-blue-600">
                      {post.title}
                    </h4>
                    <div
                      className="mt-1.5 line-clamp-2 text-xs text-slate-400"
                      dangerouslySetInnerHTML={{
                        __html: post.content.replace(/<[^>]*>/g, " ").slice(0, 120),
                      }}
                    />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                      <MessageSquare className="h-3 w-3" />
                      {post.commentCount}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[10px] font-medium text-slate-400">
                  <span>{post.authorName}</span>
                  <span>·</span>
                  <span>
                    {new Date(post.createdAt).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Write / Edit view ──────────────────────────────────────
  if (view === "write" || view === "edit") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={goList}
            className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
            목록
          </button>
          <h3 className="text-xl font-black text-slate-900">
            {view === "edit" ? "게시글 수정" : "새 게시글"}
          </h3>
        </div>

        <div className="rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm">
          <input
            type="text"
            placeholder="제목을 입력하세요"
            className="mb-5 w-full border-b border-slate-100 pb-4 text-xl font-black text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-300"
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
          />

          <PostEditor
            content={postContent}
            onChange={setPostContent}
            onImageUpload={uploadImageToCloudinary}
          />

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={goList}
              className="cursor-pointer rounded-2xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              onClick={() => void submitPost()}
              disabled={isSubmittingPost || !postTitle.trim()}
              className="flex cursor-pointer items-center gap-2 rounded-2xl bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmittingPost && <Loader2 className="h-4 w-4 animate-spin" />}
              {view === "edit" ? "수정 완료" : "게시하기"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────
  if (view === "detail" && selectedPost) {
    return (
      <div className="space-y-6">
        {/* Back + actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={goList}
            className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
            목록
          </button>
          {selectedPost.authorId === uid && (
            <div className="flex gap-2">
              <button
                onClick={() => openEdit(selectedPost)}
                className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-600"
              >
                <Pencil className="h-4 w-4" />
                수정
              </button>
              <button
                onClick={() => void deletePost(selectedPost)}
                className="flex cursor-pointer items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-500 transition hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                삭제
              </button>
            </div>
          )}
        </div>

        {/* Post body */}
        <div className="rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm">
          <h2 className="mb-3 text-2xl font-black text-slate-900">{selectedPost.title}</h2>
          <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5 text-xs font-medium text-slate-400">
            <span className="font-bold text-slate-600">{selectedPost.authorName}</span>
            <span>·</span>
            <span>
              {new Date(selectedPost.createdAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            {selectedPost.updatedAt !== selectedPost.createdAt && (
              <>
                <span>·</span>
                <span>수정됨</span>
              </>
            )}
          </div>
          <PostContent html={selectedPost.content} />
        </div>

        {/* Comments */}
        <div className="rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm">
          <h4 className="mb-5 flex items-center gap-2 font-black text-slate-800">
            <MessageSquare className="h-4 w-4 text-blue-500" />
            댓글 {comments.length > 0 ? `(${comments.length})` : ""}
          </h4>

          {isLoadingComments ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-4 text-center text-sm font-medium text-slate-300">
              첫 댓글을 남겨보세요!
            </p>
          ) : (
            <div className="mb-6 space-y-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="group flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-600">
                    {comment.authorName.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-700">{comment.authorName}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(comment.createdAt).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{comment.content}</p>
                  </div>
                  {comment.authorId === uid && (
                    <button
                      onClick={() => void deleteComment(comment)}
                      className="cursor-pointer opacity-0 transition group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5 text-slate-300 hover:text-red-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Comment input */}
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">
              {userName.slice(0, 1)}
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
              <input
                type="text"
                placeholder="댓글을 입력하세요..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-300"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitComment();
                  }
                }}
              />
              <button
                onClick={() => void submitComment()}
                disabled={isSubmittingComment || !commentText.trim()}
                className="cursor-pointer rounded-xl bg-blue-600 p-1.5 text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                {isSubmittingComment
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
