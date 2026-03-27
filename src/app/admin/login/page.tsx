"use client";

import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Activity, Loader2, Shield } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase/config";
import { clearClientSession, setClientSession } from "@/lib/session";
import type { AdminUser } from "@/types";

type AdminLoginFormState = {
  adminId: string;
  password: string;
};

const INITIAL_FORM: AdminLoginFormState = {
  adminId: "",
  password: "",
};

function toAdminEmail(adminId: string) {
  return `${adminId.trim().toLowerCase()}@admin.company-life-helper.internal`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "어드민 아이디 또는 비밀번호가 올바르지 않습니다.";
      case "auth/too-many-requests":
        return "시도가 너무 많습니다. 잠시 후 다시 로그인해주세요.";
      default:
        return "어드민 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export default function AdminLoginPage() {
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

    const adminId = form.adminId.trim().toLowerCase();

    if (!adminId || !form.password) {
      setError("어드민 아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const { auth, db } = getFirebaseClient();
      const credential = await signInWithEmailAndPassword(
        auth,
        toAdminEmail(adminId),
        form.password,
      );

      const userRef = doc(db, "adminUsers", credential.user.uid);
      const userSnapshot = await getDoc(userRef);

      if (!userSnapshot.exists()) {
        await signOut(auth);
        clearClientSession();
        setError("어드민 회원 정보를 찾을 수 없습니다.");
        return;
      }

      const adminUser = userSnapshot.data() as AdminUser;

      setClientSession({
        uid: credential.user.uid,
        accountType: "admin",
        role: adminUser.role,
        status: adminUser.status,
        teamId: adminUser.teamId,
      });

      if (adminUser.status === "pending") {
        router.push("/pending");
        return;
      }

      if (adminUser.status === "rejected") {
        await signOut(auth);
        clearClientSession();
        setError("반려된 어드민 계정입니다.");
        return;
      }

      router.push("/admin");
    } catch (loginError) {
      clearClientSession();
      setError(toErrorMessage(loginError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_55%,#020617_100%)] text-white">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="flex flex-col justify-between rounded-[2.5rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur lg:p-10">
          <div>
            <div className="flex items-center gap-4">
              <div className="rounded-3xl bg-white/10 p-3 backdrop-blur">
                <Image
                  src="/image/logo.png"
                  alt="웹앱팀 라이프 헬퍼 관리자 로고"
                  width={64}
                  height={64}
                  className="h-14 w-14 object-contain"
                  priority
                />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight">Admin Console</p>
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">
                  Restricted Access
                </p>
              </div>
            </div>

            <h1 className="mt-12 text-4xl font-black leading-tight lg:text-6xl">
              관리자 전용
              <br />
              어드민 콘솔
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 lg:text-base">
              팀 관리, 공지 등록, 투표 생성 등 다양한 운영 기능을
              어드민 콘솔에서 한 번에 관리하세요.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                <Activity className="h-5 w-5 text-cyan-300" />
                <p className="mt-3 text-lg font-bold">어드민 ID 로그인</p>
                <p className="mt-2 text-sm text-slate-300">
                  이메일 대신 지정된 어드민 ID로 로그인해요
                </p>
              </div>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                <Shield className="h-5 w-5 text-cyan-300" />
                <p className="mt-3 text-lg font-bold">역할 기반 권한</p>
                <p className="mt-2 text-sm text-slate-300">
                  담당 팀과 권한에 맞는 기능만 열려요
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-[1.75rem] border border-white/10 bg-black/20 p-5 text-sm text-slate-300">
            아직 어드민 계정이 없으신가요? 오른쪽 하단에서 바로 가입하고 승인 요청을 보내세요.
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-[2.25rem] border border-white/10 bg-white/95 p-8 text-slate-900 shadow-2xl shadow-black/20 lg:p-9">
            <div className="mb-6 flex items-center gap-3">
              <Image
                src="/image/logo.png"
                alt="관리자 로고"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">
                  Admin Login
                </p>
                <h2 className="mt-1 text-3xl font-black">어드민 로그인</h2>
              </div>
            </div>

            <p className="text-sm leading-6 text-slate-500">
              영문 ID와 비밀번호로 로그인하고 관리자 포털에 접근하세요.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">어드민 아이디</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
                  value={form.adminId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, adminId: event.target.value }))
                  }
                  placeholder="webmaster"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">비밀번호</span>
                <input
                  type="password"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-slate-200 transition hover:scale-[1.01] hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4" />
                )}
                {isSubmitting ? "로그인 중..." : "어드민 로그인"}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              <Link
                href="/admin/signup"
                className="block rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              >
                어드민 회원가입
              </Link>
              <Link
                href="/login"
                className="block text-center text-sm font-bold text-slate-400 transition hover:text-slate-700"
              >
                일반 사용자 로그인
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
