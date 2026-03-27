"use client";

import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  ArrowRight,
  CloudSun,
  Loader2,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase/config";
import { clearClientSession } from "@/lib/session";
import type { Feature, FrontUser, Team, UserStatus } from "@/types";

type FrontSignupFormState = {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  teamId: string;
};

const INITIAL_FORM: FrontSignupFormState = {
  email: "",
  password: "",
  confirmPassword: "",
  name: "",
  teamId: "",
};

const DEFAULT_TEAM_FEATURES: Feature[] = [];
const DEFAULT_STATUS: UserStatus = "pending";

function toErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "이미 사용 중인 이메일입니다.";
      case "auth/invalid-email":
        return "이메일 형식이 올바르지 않습니다.";
      case "auth/weak-password":
        return "비밀번호는 조금 더 길고 안전하게 입력해주세요.";
      default:
        return "회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export default function FrontSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FrontSignupFormState>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);

  useEffect(() => {
    async function loadTeams() {
      if (!isFirebaseConfigured) {
        setIsLoadingTeams(false);
        return;
      }

      try {
        const { db } = getFirebaseClient();
        const teamSnapshot = await getDocs(query(collection(db, "teams"), orderBy("name")));
        const nextTeams = teamSnapshot.docs.map((teamDoc) => {
          const data = teamDoc.data() as Omit<Team, "id">;

          return {
            id: teamDoc.id,
            ...data,
          };
        });

        setTeams(nextTeams);
      } catch (loadError) {
        setError(toErrorMessage(loadError));
      } finally {
        setIsLoadingTeams(false);
      }
    }

    loadTeams();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isFirebaseConfigured) {
      setError("Firebase 환경 변수가 비어 있습니다. `.env.local`을 먼저 설정해주세요.");
      return;
    }

    const email = form.email.trim().toLowerCase();
    const teamId = form.teamId.trim();
    const name = form.name.trim();

    if (!email || !name || !teamId || !form.password) {
      setError("이름, 이메일, 소속 팀, 비밀번호를 모두 입력해주세요.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const { auth, db } = getFirebaseClient();
      const credential = await createUserWithEmailAndPassword(auth, email, form.password);

      const frontUser: FrontUser = {
        uid: credential.user.uid,
        email,
        name,
        teamId,
        status: DEFAULT_STATUS,
        createdAt: Date.now(),
      };

      await setDoc(doc(db, "frontUsers", credential.user.uid), {
        ...frontUser,
        features: DEFAULT_TEAM_FEATURES,
        updatedAt: serverTimestamp(),
      });

      await signOut(auth);
      clearClientSession();
      router.push("/pending");
    } catch (signupError) {
      setError(toErrorMessage(signupError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const noTeamsAvailable = !isLoadingTeams && teams.length === 0;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between rounded-[2rem] border border-white/60 bg-white/80 px-6 py-4 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight">Life Helper</p>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                신규 가입
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-3 rounded-full border border-slate-100 bg-white px-4 py-2 text-sm font-bold shadow-sm sm:flex">
            <CloudSun className="h-4 w-4 text-blue-500" />
            <span>Today</span>
            <span className="text-slate-300">|</span>
            <span className="font-medium text-slate-600">Team Onboarding</span>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="space-y-6">
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-2xl shadow-blue-200 lg:p-12">
              <div className="relative z-10">
                <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em]">
                  새 멤버 합류
                </span>
                <h1 className="mt-5 text-4xl font-black leading-tight lg:text-6xl">
                  팀과 함께
                  <br />
                  시작해보세요 🙌
                </h1>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-blue-100 lg:text-base">
                  이메일로 간편하게 가입하고, 팀 승인 후 점심 추천·팀 일정·공지사항 등
                  다양한 기능을 바로 이용할 수 있어요.
                </p>

                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[1.75rem] bg-white/12 p-5 backdrop-blur">
                    <ShieldCheck className="h-5 w-5 text-cyan-200" />
                    <p className="mt-3 text-lg font-bold">승인 후 바로 시작</p>
                    <p className="mt-2 text-sm text-blue-100">
                      가입 후 팀장 승인이 완료되면 대시보드가 열려요.
                    </p>
                  </div>
                  <div className="rounded-[1.75rem] bg-white/12 p-5 backdrop-blur">
                    <ArrowRight className="h-5 w-5 text-cyan-200" />
                    <p className="mt-3 text-lg font-bold">팀 선택 가입</p>
                    <p className="mt-2 text-sm text-blue-100">
                      소속 팀을 선택해서 팀 맞춤 기능을 이용하세요.
                    </p>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-12 -right-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
            </div>
          </section>

          <section className="rounded-[2.25rem] border border-white/60 bg-white/85 p-8 shadow-xl shadow-slate-200/70 backdrop-blur lg:p-9">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-600">
              Life Helper
            </p>
            <h2 className="mt-3 text-3xl font-black text-slate-900">회원가입</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              이메일로 가입하고 팀 승인 후 Life Helper의 모든 기능을 이용하세요.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">이름</span>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="홍길동"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">소속 팀</span>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    value={form.teamId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, teamId: event.target.value }))
                    }
                    disabled={isLoadingTeams || noTeamsAvailable}
                  >
                    <option value="">
                      {isLoadingTeams
                        ? "팀 목록 불러오는 중..."
                        : noTeamsAvailable
                          ? "선택 가능한 팀이 없습니다"
                          : "팀을 선택하세요"}
                    </option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

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

              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">비밀번호</span>
                  <input
                    type="password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, password: event.target.value }))
                    }
                    placeholder="8자 이상"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">비밀번호 확인</span>
                  <input
                    type="password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    value={form.confirmPassword}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, confirmPassword: event.target.value }))
                    }
                    placeholder="비밀번호를 다시 입력"
                  />
                </label>
              </div>

              {noTeamsAvailable ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                  아직 생성된 팀이 없습니다. 어드민이 먼저 팀을 만든 뒤 가입할 수 있습니다.
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting || isLoadingTeams || noTeamsAvailable}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:scale-[1.01] hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {isSubmitting ? "가입 처리 중..." : "가입하기"}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              <Link
                href="/login"
                className="block rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
              >
                이미 계정이 있으신가요? 로그인
              </Link>
              <Link
                href="/admin/signup"
                className="block text-center text-sm font-bold text-slate-400 transition hover:text-slate-700"
              >
                관리자(어드민)로 가입하기
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
