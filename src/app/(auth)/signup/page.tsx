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
  Loader2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Image from "next/image";
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
          return { id: teamDoc.id, ...data };
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
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-2 lg:px-10">
        {/* Left panel */}
        <section className="flex flex-col rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-2xl shadow-blue-200 lg:p-10">
          <div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-white/14 p-2.5 backdrop-blur">
                <Image
                  src="/image/logo.png"
                  alt="디아이웨어 라이프 헬퍼 로고"
                  width={48}
                  height={48}
                  className="h-10 w-10 object-contain"
                  priority
                />
              </div>
              <div>
                <p className="text-base font-black tracking-tight">디아이웨어 라이프 헬퍼</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-100/80">
                  Diware Life Helper
                </p>
              </div>
            </div>

            <h1 className="mt-10 text-3xl font-black leading-tight lg:text-4xl">
              팀과 함께
              <br />
              시작해보세요 👋
            </h1>
            <p className="mt-4 max-w-2xl text-xs leading-6 text-blue-100 lg:text-sm">
              이메일로 간편하게 가입하고, 팀 승인 후 점심 추천부터
              팀 일정, 공지사항까지 한곳에서 바로 이용할 수 있어요.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] bg-white/12 p-4 backdrop-blur">
                <ShieldCheck className="h-5 w-5 text-cyan-200" />
                <p className="mt-3 text-base font-bold">승인 후 바로 시작</p>
                <p className="mt-1 text-xs text-blue-100">
                  가입 후 팀장 승인이 완료되면 대시보드가 열려요
                </p>
              </div>
              <div className="rounded-[1.5rem] bg-white/12 p-4 backdrop-blur">
                <UserPlus className="h-5 w-5 text-cyan-200" />
                <p className="mt-3 text-base font-bold">팀 선택 가입</p>
                <p className="mt-1 text-xs text-blue-100">
                  소속 팀을 선택해서 팀 맞춤 기능을 이용하세요
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[1.25rem] border border-white/15 bg-white/10 p-4 text-xs text-blue-100">
            이미 계정이 있으신가요? 오른쪽 하단 로그인 버튼을 눌러 바로 시작하세요.
          </div>
        </section>

        {/* Right panel — form */}
        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-[2.25rem] border border-white/60 bg-white/90 p-8 text-slate-900 shadow-2xl shadow-slate-200/70 backdrop-blur lg:p-9">
            <div className="mb-6 flex items-center gap-3">
              <Image
                src="/image/logo.png"
                alt="디아이웨어 라이프 헬퍼"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-600">
                  Diware Life Helper
                </p>
                <h2 className="mt-1 text-3xl font-black">회원가입</h2>
              </div>
            </div>

            <p className="text-sm leading-6 text-slate-500">
              회사 이메일로 가입하고 팀 승인 후 Life Helper 포털을 이용하세요.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
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
                    className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
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

              <div className="grid gap-5 sm:grid-cols-2">
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
                  아직 생성된 팀이 없습니다. 관리자가 팀을 만든 뒤 가입할 수 있어요.
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
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:scale-[1.01] hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {isSubmitting ? "가입 처리 중..." : "가입하기"}
              </button>
            </form>

            <div className="mt-6">
              <Link
                href="/login"
                className="block cursor-pointer rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
              >
                이미 계정이 있으신가요? 로그인
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Hidden admin signup link */}
      <Link
        href="/admin/signup"
        className="fixed bottom-4 right-5 cursor-pointer text-[10px] text-slate-300 transition-colors hover:text-slate-400"
      >
        v1.0.0
      </Link>
    </main>
  );
}
