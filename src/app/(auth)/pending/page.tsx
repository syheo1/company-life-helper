import Link from "next/link";

export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-amber-200 bg-white/90 p-8 shadow-xl shadow-amber-100/60">
        <p className="mb-2 text-sm font-medium text-amber-700">승인 대기 중</p>
        <h1 className="text-3xl font-semibold text-slate-900">곧 승인될 예정이에요! 🎉</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          가입해주셔서 감사해요. 담당 관리자가 계정을 확인하고 곧 승인할 예정이에요.
          승인이 완료되면 바로 로그인해서 이용하실 수 있어요.
        </p>
        <div className="mt-6 flex gap-3 text-sm">
          <Link href="/login" className="rounded-full bg-slate-900 px-5 py-3 font-semibold text-white">
            로그인 페이지로
          </Link>
          <Link href="/admin/login" className="rounded-full border border-slate-300 px-5 py-3 font-semibold text-slate-700">
            어드민 로그인
          </Link>
        </div>
      </section>
    </main>
  );
}
