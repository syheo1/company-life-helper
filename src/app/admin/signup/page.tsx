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
  BadgeCheck,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase/config";
import { clearClientSession } from "@/lib/session";
import type { AdminRole, AdminUser, Team, UserStatus } from "@/types";

type AdminSignupFormState = {
  adminId: string;
  password: string;
  confirmPassword: string;
  name: string;
  teamId: string;
};

const INITIAL_FORM: AdminSignupFormState = {
  adminId: "",
  password: "",
  confirmPassword: "",
  name: "",
  teamId: "",
};

const DEFAULT_ROLE: AdminRole = "team_admin";
const DEFAULT_STATUS: UserStatus = "pending";

function toAdminEmail(adminId: string) {
  return `${adminId.trim().toLowerCase()}@admin.company-life-helper.internal`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "이미 사용 중인 어드민 아이디입니다.";
      case "auth/weak-password":
        return "비밀번호는 조금 더 길고 안전하게 입력해주세요.";
      default:
        return "어드민 회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export default function AdminSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM);
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

    const adminId = form.adminId.trim().toLowerCase();
    const teamId = form.teamId.trim();
    const name = form.name.trim();

    if (!adminId || !name || !teamId || !form.password) {
      setError("이름, 어드민 아이디, 소속 팀, 비밀번호를 모두 입력해주세요.");
      return;
    }

    if (!/^[a-z]{1,10}$/.test(adminId)) {
      setError("어드민 아이디는 영문 소문자 10자 이내만 사용할 수 있습니다.");
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
      const email = toAdminEmail(adminId);
      const credential = await createUserWithEmailAndPassword(auth, email, form.password);

      const adminUser: AdminUser = {
        uid: credential.user.uid,
        adminId,
        email,
        name,
        teamId,
        role: DEFAULT_ROLE,
        status: DEFAULT_STATUS,
        createdAt: Date.now(),
      };

      await setDoc(doc(db, "adminUsers", credential.user.uid), {
        ...adminUser,
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_55%,#020617_100%)] text-white">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1fr_1fr] lg:px-10">
        <section className="flex flex-col justify-center">
          <div className="rounded-[2.5rem] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur lg:p-12">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-cyan-300">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-black">Admin Membership</p>
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">
                  Controlled Enrollment
                </p>
              </div>
            </div>

            <h1 className="mt-10 text-4xl font-black leading-tight lg:text-6xl">
              관리자 전용
              <br />
              계정 등록 절차
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 lg:text-base">
              어드민은 영문 소문자 ID로 가입하며, 일반 사용자와 별도 테이블 및 별도 인증
              흐름을 사용합니다.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                <KeyRound className="h-5 w-5 text-cyan-300" />
                <p className="mt-3 text-sm font-bold">ID Format</p>
                <p className="mt-2 text-sm text-slate-300">영문 소문자 10자 이내</p>
              </div>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                <ShieldCheck className="h-5 w-5 text-cyan-300" />
                <p className="mt-3 text-sm font-bold">Separate Table</p>
                <p className="mt-2 text-sm text-slate-300">adminUsers 컬렉션 분리</p>
              </div>
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                <BadgeCheck className="h-5 w-5 text-cyan-300" />
                <p className="mt-3 text-sm font-bold">Approval First</p>
                <p className="mt-2 text-sm text-slate-300">승인 후 포털 접근 가능</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-xl rounded-[2.25rem] border border-white/10 bg-white/95 p-8 text-slate-900 shadow-2xl shadow-black/20 lg:p-9">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">
              Admin Signup
            </p>
            <h2 className="mt-3 text-3xl font-black">어드민 회원가입</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              관리자 계정은 일반 사용자와 다른 팀 선택 기반 승인 절차를 따릅니다.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">이름</span>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="관리자명"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">소속 팀</span>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
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
                <span className="mb-2 block text-sm font-bold text-slate-700">어드민 아이디</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
                  value={form.adminId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, adminId: event.target.value }))
                  }
                  placeholder="webmaster"
                />
                <span className="mt-2 block text-xs font-medium text-slate-500">
                  영문 소문자만 가능하며 10자 이내로 제한됩니다.
                </span>
              </label>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">비밀번호</span>
                  <input
                    type="password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
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
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100"
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
                  아직 생성된 팀이 없습니다. 먼저 팀을 만든 뒤 어드민 가입을 진행해주세요.
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-slate-200 transition hover:scale-[1.01] hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {isSubmitting ? "가입 처리 중..." : "어드민 회원가입"}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              <Link
                href="/admin/login"
                className="block rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              >
                어드민 로그인으로 이동
              </Link>
              <Link
                href="/signup"
                className="block text-center text-sm font-bold text-slate-400 transition hover:text-slate-700"
              >
                프론트 회원가입으로 이동
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
