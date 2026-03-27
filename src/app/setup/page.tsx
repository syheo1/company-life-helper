"use client";

import { FirebaseError } from "firebase/app";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Building2, Check, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";

import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase/config";
import type { Feature } from "@/types";

type SetupFormState = {
  teamId: string;
  name: string;
};

const INITIAL_FORM: SetupFormState = {
  teamId: "webapp-team",
  name: "디아이웨어",
};

const FEATURE_OPTIONS: { id: Feature; label: string }[] = [
  { id: "weather", label: "날씨" },
  { id: "lunch", label: "점심 추천" },
  { id: "vote", label: "투표" },
  { id: "notice", label: "공지" },
  { id: "board", label: "게시판" },
];

function toErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "Firestore 쓰기 권한이 없습니다. Firestore 규칙을 먼저 열어주세요.";
      case "unavailable":
        return "Firestore에 연결할 수 없습니다. 네트워크 또는 Firebase 설정을 확인해주세요.";
      case "not-found":
        return "Firestore Database가 아직 생성되지 않았습니다. 콘솔에서 먼저 만들어주세요.";
      default:
        return `팀 생성 중 Firebase 오류가 발생했습니다: ${error.code}`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export default function SetupPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [selectedFeatures, setSelectedFeatures] = useState<Feature[]>(
    FEATURE_OPTIONS.map((feature) => feature.id),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const normalizedTeamId = useMemo(
    () => form.teamId.trim().toLowerCase().replace(/\s+/g, "-"),
    [form.teamId],
  );

  function toggleFeature(feature: Feature) {
    setSelectedFeatures((current) =>
      current.includes(feature)
        ? current.filter((value) => value !== feature)
        : [...current, feature],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isFirebaseConfigured) {
      setError("Firebase 환경 변수가 비어 있습니다. `.env.local`을 먼저 설정해주세요.");
      return;
    }

    const name = form.name.trim();

    if (!normalizedTeamId || !name) {
      setError("팀 ID와 팀 이름을 입력해주세요.");
      return;
    }

    if (!/^[a-z0-9-]{2,30}$/.test(normalizedTeamId)) {
      setError("팀 ID는 영문 소문자, 숫자, 하이픈만 사용해 2~30자로 입력해주세요.");
      return;
    }

    if (selectedFeatures.length === 0) {
      setError("최소 1개 이상의 기능을 선택해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const { db } = getFirebaseClient();

      await setDoc(doc(db, "teams", normalizedTeamId), {
        name,
        features: selectedFeatures,
        createdAt: Date.now(),
        updatedAt: serverTimestamp(),
      });

      setSuccessMessage("첫 팀이 생성되었습니다. 이제 회원가입에서 팀을 선택할 수 있습니다.");
    } catch (setupError) {
      setError(toErrorMessage(setupError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="flex flex-col justify-between rounded-[2.5rem] bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white shadow-2xl shadow-emerald-200 lg:p-10">
          <div>
            <div className="flex items-center gap-4">
              <div className="rounded-3xl bg-white/14 p-3 backdrop-blur">
                <Image
                  src="/image/logo.png"
                  alt="디아이웨어 라이프 헬퍼 로고"
                  width={64}
                  height={64}
                  className="h-14 w-14 object-contain"
                  priority
                />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight">초기 팀 설정</p>
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-100/80">
                  Setup Wizard
                </p>
              </div>
            </div>

            <h1 className="mt-12 text-4xl font-black leading-tight lg:text-6xl">
              첫 팀을 만들고
              <br />
              시작해볼까요? 🏢
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-emerald-50 lg:text-base">
              팀을 먼저 만들어두면 가입할 때 바로 선택할 수 있어요.
              팀 이름과 사용할 기능을 설정하고 Life Helper를 시작하세요.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.75rem] bg-white/12 p-5 backdrop-blur">
                <Building2 className="h-5 w-5 text-emerald-100" />
                <p className="mt-3 text-lg font-bold">팀 생성</p>
                <p className="mt-2 text-sm text-emerald-50">
                  팀 이름을 정하고 첫 팀을 바로 만들어요.
                </p>
              </div>
              <div className="rounded-[1.75rem] bg-white/12 p-5 backdrop-blur">
                <ShieldCheck className="h-5 w-5 text-emerald-100" />
                <p className="mt-3 text-lg font-bold">기능 설정</p>
                <p className="mt-2 text-sm text-emerald-50">
                  팀에서 사용할 기능을 골라 활성화하세요.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 rounded-[1.75rem] border border-white/15 bg-white/10 p-5 text-sm text-emerald-50">
            팀 생성 후에는 <span className="font-bold">프론트 회원가입</span> 또는{" "}
            <span className="font-bold">어드민 회원가입</span> 화면으로 이동해 계속 진행하면
            됩니다.
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-xl rounded-[2.25rem] border border-white/60 bg-white/90 p-8 shadow-2xl shadow-slate-200/70 backdrop-blur lg:p-9">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-600">
              Team Setup
            </p>
            <h2 className="mt-3 text-3xl font-black text-slate-900">첫 팀 생성</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              팀 ID와 이름을 설정하고 사용할 기능을 선택하세요.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">팀 ID</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  value={form.teamId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, teamId: event.target.value }))
                  }
                  placeholder="webapp-team"
                />
                <span className="mt-2 block text-xs font-medium text-slate-500">
                  실제 팀 ID: <span className="font-bold">{normalizedTeamId || "-"}</span>
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">팀 이름</span>
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="디아이웨어"
                />
              </label>

              <div>
                <span className="mb-3 block text-sm font-bold text-slate-700">활성 기능</span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {FEATURE_OPTIONS.map((feature) => {
                    const selected = selectedFeatures.includes(feature.id);

                    return (
                      <button
                        key={feature.id}
                        type="button"
                        onClick={() => toggleFeature(feature.id)}
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                          selected
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        <span>{feature.label}</span>
                        {selected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {successMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-100 transition hover:scale-[1.01] hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Building2 className="h-4 w-4" />
                )}
                {isSubmitting ? "팀 생성 중..." : "첫 팀 생성"}
              </button>
            </form>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href="/signup"
                className="block rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
              >
                프론트 회원가입
              </Link>
              <Link
                href="/admin/signup"
                className="block rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
              >
                어드민 회원가입
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
