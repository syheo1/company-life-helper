"use client";

import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Loader2, LogIn } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase/config";
import { clearClientSession, setClientSession } from "@/lib/session";
import type { FrontUser } from "@/types";

type LoginFormState = {
  email: string;
  password: string;
};

const INITIAL_FORM: LoginFormState = {
  email: "",
  password: "",
};

function toErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "이메일 또는 비밀번호가 올바르지 않습니다.";
      case "auth/too-many-requests":
        return "시도가 너무 많습니다. 잠시 후 다시 로그인해주세요.";
      default:
        return "로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export default function FrontLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isFirebaseConfigured) {
      setError("Firebase 환경 변수가 비어 있습니다. `.env.local`을 먼저 설정해주세요.");
      return;
    }

    if (!form.email.trim() || !form.password) {
      setError("이메일과 비밀번호를 모두 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const { auth, db } = getFirebaseClient();
      const credential = await signInWithEmailAndPassword(
        auth,
        form.email.trim().toLowerCase(),
        form.password,
      );

      const userRef = doc(db, "frontUsers", credential.user.uid);
      const userSnapshot = await getDoc(userRef);

      if (!userSnapshot.exists()) {
        await signOut(auth);
        clearClientSession();
        setError("프론트 회원 정보를 찾을 수 없습니다. 관리자에게 문의해주세요.");
        return;
      }

      const user = userSnapshot.data() as FrontUser;

      setClientSession({
        uid: credential.user.uid,
        accountType: "front",
        status: user.status,
        teamId: user.teamId,
      });

      if (user.status === "pending") {
        router.push("/pending");
        return;
      }

      if (user.status === "rejected") {
        await signOut(auth);
        clearClientSession();
        setError("반려된 계정입니다. 관리자에게 문의해주세요.");
        return;
      }

      router.push("/dashboard");
    } catch (loginError) {
      clearClientSession();
      setError(toErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-2 lg:px-10">
        <section className="flex flex-col rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-2xl shadow-blue-200 lg:p-10">
          <div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-white/14 p-2.5 backdrop-blur">
                <Image
                  src="/image/CLH_logo.png"
                  alt="웹앱팀 라이프 헬퍼 로고"
                  width={48}
                  height={48}
                  className="h-10 w-10 object-contain"
                  priority
                />
              </div>
              <div>
                <p className="text-base font-black tracking-tight">웹앱팀 라이프 헬퍼</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-100/80">
                  Front Portal
                </p>
              </div>
            </div>

            <h1 className="mt-10 text-3xl font-black leading-tight lg:text-4xl">
              오늘도 반갑습니다,
              <br />
              Life Helper예요 👋
            </h1>
            <p className="mt-4 max-w-2xl text-xs leading-6 text-blue-100 lg:text-sm">
              팀원들과 함께하는 스마트한 사내 생활, 지금 바로 시작하세요.
              점심 추천부터 팀 일정, 공지사항까지 한곳에서 확인할 수 있어요.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] bg-white/12 p-4 backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">
                  간편 로그인
                </p>
                <p className="mt-1.5 text-base font-bold">이메일로 시작</p>
                <p className="mt-1 text-xs text-blue-100">회사 이메일 하나로 바로 접속해요</p>
              </div>
              <div className="rounded-[1.5rem] bg-white/12 p-4 backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">
                  팀 전용 기능
                </p>
                <p className="mt-1.5 text-base font-bold">팀 맞춤 서비스</p>
                <p className="mt-1 text-xs text-blue-100">
                  승인 후 팀에 맞는 기능이 열려요
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[1.25rem] border border-white/15 bg-white/10 p-4 text-xs text-blue-100">
            아직 계정이 없으신가요? 오른쪽 하단 회원가입 버튼을 눌러 지금 바로 합류하세요.
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-[2.25rem] border border-white/60 bg-white/90 p-8 text-slate-900 shadow-2xl shadow-slate-200/70 backdrop-blur lg:p-9">
            <div className="mb-6 flex items-center gap-3">
              <Image
                src="/image/CLH_logo.png"
                alt="웹앱팀 라이프 헬퍼"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-600">
                  Life Helper
                </p>
                <h2 className="mt-1 text-3xl font-black">로그인</h2>
              </div>
            </div>

            <p className="text-sm leading-6 text-slate-500">
              회사 이메일로 로그인하고 Life Helper 포털을 이용하세요.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">이메일</span>
                <input
                  type="email"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="you@company.com"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">비밀번호</span>
                <input
                  type="password"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="비밀번호 입력"
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:scale-[1.01] hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {isSubmitting ? "로그인 중..." : "로그인"}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              <Link
                href="/signup"
                className="block rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
              >
                아직 계정이 없으신가요? 회원가입
              </Link>
              <Link
                href="/admin/login"
                className="block text-center text-sm font-bold text-slate-400 transition hover:text-slate-700"
              >
                관리자(어드민)이신가요?
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
