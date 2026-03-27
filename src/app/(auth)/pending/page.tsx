import Link from "next/link";

export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-3xl border border-amber-200 bg-white/90 p-8 shadow-xl shadow-amber-100/60">
        <p className="mb-2 text-sm font-medium text-amber-700">승인 대기 중</p>
        <h1 className="text-3xl font-semibold text-slate-900">가입 신청 완료됐어요! 🎉</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          관리자가 확인 후 승인해드릴 예정이에요.<br />
          보통 1~2시간 안에 처리되니 조금만 기다려주세요.<br />
          승인되면 아래 버튼으로 바로 로그인하실 수 있어요.
        </p>
        <div className="mt-6 flex gap-3 text-sm">
          <Link href="/login" className="cursor-pointer rounded-full bg-slate-900 px-5 py-3 font-semibold !text-[#fff]">
            로그인 페이지로
          </Link>
        </div>
      </section>
    </main>
  );
}
