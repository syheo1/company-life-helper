import Link from "next/link";

export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-amber-200 bg-white/90 p-8 shadow-xl shadow-amber-100/60">
        <p className="mb-2 text-sm font-medium text-amber-700">승인 대기</p>
        <h1 className="text-3xl font-semibold text-slate-900">계정 승인을 기다리는 중입니다</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          프론트 사용자와 어드민은 서로 다른 회원 테이블을 사용하며, 현재 계정은 아직 승인되지 않았습니다.
        </p>
        <div className="mt-6 flex gap-3 text-sm">
          <Link href="/login" className="rounded-full bg-slate-900 px-5 py-3 font-semibold text-white">
            프론트 로그인
          </Link>
          <Link href="/admin/login" className="rounded-full border border-slate-300 px-5 py-3 font-semibold text-slate-700">
            어드민 로그인
          </Link>
        </div>
      </section>
    </main>
  );
}
