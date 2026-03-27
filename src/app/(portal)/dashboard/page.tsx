"use client";

import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  House,
  LogOut,
  Shield,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import { signOut } from "firebase/auth";

import { getFirebaseClient } from "@/lib/firebase/config";
import { clearClientSession, SESSION_COOKIE_KEYS } from "@/lib/session";
import type { CalendarEvent, Notice, Poll, Restaurant, WorkLocation } from "@/types";

type TabId = "home" | "calendar" | "lunch" | "vote";

type WeatherData = {
  temp: number;
  label: string;
  code: number;
  windSpeed: number;
  locationName: string;
  willRain: boolean;
  willSnow: boolean;
};

const TAB_TITLES: Record<TabId, string> = {
  home: "홈",
  calendar: "팀 일정",
  lunch: "점심 추천",
  vote: "투표",
};

const WEATHER_CODES: Record<number, string> = {
  0: "맑음",
  1: "대체로 맑음",
  2: "부분 흐림",
  3: "흐림",
  45: "안개",
  48: "안개",
  51: "이슬비",
  53: "이슬비",
  55: "이슬비",
  61: "비",
  63: "비",
  65: "강한 비",
  71: "눈",
  73: "눈",
  75: "강한 눈",
  80: "소나기",
  81: "소나기",
  82: "강한 소나기",
  95: "뇌우",
  96: "뇌우",
  99: "뇌우",
};

const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

const FALLBACK_RESTAURANTS: Restaurant[] = [
  { id: "f1", name: "성수 진라멘", category: "일식", rating: 4.8, walkMinutes: 5, teamId: "", createdAt: 0 },
  { id: "f2", name: "감성 타코랩", category: "멕시칸", rating: 4.7, walkMinutes: 7, teamId: "", createdAt: 0 },
  { id: "f3", name: "오늘의 가정식", category: "한식", rating: 4.5, walkMinutes: 3, teamId: "", createdAt: 0 },
  { id: "f4", name: "버거보이", category: "양식", rating: 4.6, walkMinutes: 4, teamId: "", createdAt: 0 },
  { id: "f5", name: "샐러드포", category: "건강식", rating: 4.9, walkMinutes: 10, teamId: "", createdAt: 0 },
];

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop()?.split(";")[0] ?? "");
  return "";
}

export default function DashboardPage() {
  const router = useRouter();

  // Session
  const [uid, setUid] = useState("");
  const [teamId, setTeamId] = useState("");
  const [userName, setUserName] = useState("");
  const [teamName, setTeamName] = useState("");

  // UI
  const [activeTab, setActiveTab] = useState<TabId>("home");

  // Data
  const [notices, setNotices] = useState<Notice[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [votedPolls, setVotedPolls] = useState<Record<string, string>>({});

  // Calendar navigation
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // Lunch roulette
  const [pickedLunch, setPickedLunch] = useState<Restaurant | null>(null);
  const [isPickingLunch, setIsPickingLunch] = useState(false);

  // Weather
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Work locations
  const [workLocations, setWorkLocations] = useState<WorkLocation[]>([]);
  const [selectedWorkLocationId, setSelectedWorkLocationId] = useState<string>("");

  // Notice detail modal
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  // Loading / voting / error
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isVoting, setIsVoting] = useState<string | null>(null);

  // Voted-polls checked flag (only check once per session)
  const votedChecked = useRef(false);

  // Init session from cookies
  useEffect(() => {
    const cookieUid = getCookie(SESSION_COOKIE_KEYS.uid);
    const cookieTeamId = getCookie(SESSION_COOKIE_KEYS.teamId);
    setUid(cookieUid);
    setTeamId(cookieTeamId);
  }, []);

  // Load all static data once uid+teamId are ready
  useEffect(() => {
    if (!uid || !teamId) return;
    void loadStaticData();
  }, [uid, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time polls via onSnapshot (single where to avoid composite index requirement)
  useEffect(() => {
    if (!teamId) return;
    const { db } = getFirebaseClient();
    const q = query(collection(db, "polls"), where("teamId", "==", teamId));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs
          .map((d) => d.data() as Poll)
          .filter((p) => p.status === "active");
        list.sort((a, b) => b.createdAt - a.createdAt);
        setPolls(list);
      },
      (err) => {
        console.error("[polls onSnapshot]", err);
        setLoadError(`투표 로드 실패: ${err.message}`);
      },
    );
    return () => unsub();
  }, [teamId]);

  // Check which polls user has voted on — once after uid+polls are ready
  useEffect(() => {
    if (!uid || polls.length === 0 || votedChecked.current) return;
    votedChecked.current = true;
    void checkVotedPolls(polls);
  }, [uid, polls]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh tab-specific data on tab change
  useEffect(() => {
    if (!teamId) return;
    if (activeTab === "lunch") { void fetchRestaurants(); void fetchWorkLocations(); }
    if (activeTab === "home") void fetchNotices();
    if (activeTab === "calendar") void fetchCalendarEvents();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadStaticData() {
    setIsLoading(true);
    setLoadError("");
    try {
      await Promise.all([
        fetchUserAndTeam(),
        fetchNotices(),
        fetchCalendarEvents(),
        fetchRestaurants(),
        fetchWorkLocations(),
        fetchWeather(),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[loadStaticData]", err);
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchWeather() {
    try {
      let lat = 37.5665;
      let lon = 126.978;
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
        );
        lat = position.coords.latitude;
        lon = position.coords.longitude;
      } catch {
        // Fall back to Seoul
      }

      const [weatherRes, geoRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=precipitation_probability,weather_code&forecast_days=1&timezone=auto`,
        ),
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`,
          { headers: { "User-Agent": "company-life-helper-app" } },
        ),
      ]);

      const weatherData = (await weatherRes.json()) as {
        current: { temperature_2m: number; weather_code: number; wind_speed_10m: number };
        hourly: { time: string[]; precipitation_probability: number[]; weather_code: number[] };
      };

      const geoData = (await geoRes.json()) as {
        address?: {
          city?: string;
          town?: string;
          county?: string;
          state?: string;
          suburb?: string;
          city_district?: string;
          borough?: string;
        };
      };

      const city =
        geoData.address?.city ??
        geoData.address?.town ??
        geoData.address?.state ??
        "";
      const district =
        geoData.address?.city_district ??
        geoData.address?.borough ??
        geoData.address?.county ??
        "";
      const locationName =
        city && district ? `${city} ${district}`
        : city || district || geoData.address?.suburb || "현재 위치";

      // Check next 6 hours for rain/snow
      const nowHour = new Date().getHours();
      const next6 = weatherData.hourly.weather_code.slice(nowHour, nowHour + 6);
      const next6Prob = weatherData.hourly.precipitation_probability.slice(nowHour, nowHour + 6);
      const willRain =
        next6.some((c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) ||
        next6Prob.some((p) => p >= 60);
      const willSnow = next6.some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86);

      setWeather({
        temp: Math.round(weatherData.current.temperature_2m),
        label: WEATHER_CODES[weatherData.current.weather_code] ?? "날씨 정보 없음",
        code: weatherData.current.weather_code,
        windSpeed: Math.round(weatherData.current.wind_speed_10m * 10) / 10,
        locationName,
        willRain,
        willSnow,
      });
    } catch {
      // Silently ignore weather failures
    }
  }

  async function fetchUserAndTeam() {
    console.log("[fetchUserAndTeam] uid:", uid, "teamId:", teamId);
    const { db } = getFirebaseClient();
    const [userSnap, teamSnap] = await Promise.all([
      getDoc(doc(db, "frontUsers", uid)),
      getDoc(doc(db, "teams", teamId)),
    ]);
    if (userSnap.exists()) setUserName((userSnap.data().name as string) ?? "");
    if (teamSnap.exists()) setTeamName((teamSnap.data().name as string) ?? "");
    console.log("[fetchUserAndTeam] user:", userSnap.exists(), "team:", teamSnap.exists());
  }

  async function fetchNotices() {
    console.log("[fetchNotices] teamId:", teamId);
    const { db } = getFirebaseClient();
    const snap = await getDocs(
      query(collection(db, "notices"), where("teamId", "==", teamId)),
    );
    console.log("[fetchNotices] count:", snap.size);
    const list = snap.docs.map((d) => d.data() as Notice);
    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
    setNotices(list);
  }

  async function fetchCalendarEvents() {
    console.log("[fetchCalendarEvents] teamId:", teamId);
    const { db } = getFirebaseClient();
    const snap = await getDocs(
      query(collection(db, "calendarEvents"), where("teamId", "==", teamId)),
    );
    console.log("[fetchCalendarEvents] count:", snap.size);
    const list = snap.docs.map((d) => d.data() as CalendarEvent);
    list.sort((a, b) => a.date - b.date);
    setCalendarEvents(list);
  }

  async function fetchRestaurants() {
    console.log("[fetchRestaurants] teamId:", teamId);
    const { db } = getFirebaseClient();
    const snap = await getDocs(
      query(collection(db, "restaurants"), where("teamId", "==", teamId)),
    );
    console.log("[fetchRestaurants] count:", snap.size);
    const list = snap.docs.map((d) => d.data() as Restaurant);
    setRestaurants(list);
  }

  async function fetchWorkLocations() {
    const { db } = getFirebaseClient();
    const snap = await getDocs(
      query(collection(db, "workLocations"), where("teamId", "==", teamId)),
    );
    const list = snap.docs.map((d) => d.data() as WorkLocation);
    list.sort((a, b) => a.createdAt - b.createdAt);
    setWorkLocations(list);
  }

  async function checkVotedPolls(pollList: Poll[]) {
    const { db } = getFirebaseClient();
    const results: Record<string, string> = {};
    await Promise.all(
      pollList.map(async (poll) => {
        const voteSnap = await getDoc(doc(db, "polls", poll.id, "voters", uid));
        if (voteSnap.exists()) {
          results[poll.id] = (voteSnap.data().optionId as string) ?? "";
        }
      }),
    );
    setVotedPolls(results);
  }

  async function handleVote(pollId: string, optionId: string) {
    if (isVoting || votedPolls[pollId]) return;
    setIsVoting(pollId);
    try {
      const { db } = getFirebaseClient();
      const voterRef = doc(db, "polls", pollId, "voters", uid);
      const existingVote = await getDoc(voterRef);
      if (existingVote.exists()) {
        setVotedPolls((prev) => ({
          ...prev,
          [pollId]: (existingVote.data().optionId as string) ?? "",
        }));
        return;
      }

      await runTransaction(db, async (tx) => {
        const pollRef = doc(db, "polls", pollId);
        const pollSnap = await tx.get(pollRef);
        if (!pollSnap.exists()) throw new Error("Poll not found");
        const data = pollSnap.data() as Poll;
        const updatedOptions = data.options.map((opt) =>
          opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt,
        );
        tx.update(pollRef, {
          options: updatedOptions,
          totalVotes: (data.totalVotes ?? 0) + 1,
        });
        tx.set(voterRef, { optionId, votedAt: Date.now() });
      });

      setVotedPolls((prev) => ({ ...prev, [pollId]: optionId }));
    } finally {
      setIsVoting(null);
    }
  }

  function prevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  }

  function pickLunch() {
    const filtered =
      selectedWorkLocationId
        ? restaurants.filter((r) => r.workLocationIds?.includes(selectedWorkLocationId) ?? false)
        : restaurants;
    const pool = filtered.length > 0 ? filtered : (restaurants.length > 0 ? restaurants : FALLBACK_RESTAURANTS);
    setIsPickingLunch(true);
    setPickedLunch(null);
    window.setTimeout(() => {
      setPickedLunch(pool[Math.floor(Math.random() * pool.length)]);
      setIsPickingLunch(false);
    }, 1200);
  }

  async function handleLogout() {
    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
    } catch {
      // Ignore auth errors on logout
    }
    clearClientSession();
    router.push("/login");
  }

  // Derived values
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const monthStart = new Date(calYear, calMonth, 1).getTime();
  const monthEnd = new Date(calYear, calMonth + 1, 0, 23, 59, 59).getTime();
  const monthEvents = calendarEvents.filter((e) => e.date >= monthStart && e.date <= monthEnd);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
  const todayEvents = calendarEvents.filter((e) => e.date >= todayStart && e.date <= todayEnd);

  const mainNotice = notices.find((n) => n.isPinned) ?? notices[0];
  const recentNotices = notices.filter((n) => n !== mainNotice).slice(0, 3);

  if (isLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm font-medium text-slate-400">불러오는 중...</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex h-screen items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="mb-2 text-lg font-bold text-red-600">데이터를 불러오지 못했어요</p>
          <p className="text-sm text-red-500">{loadError}</p>
          <p className="mt-4 text-xs text-slate-400">잠시 후 다시 시도하거나 관리자에게 문의해주세요.</p>
          <button
            onClick={() => void loadStaticData()}
            className="mt-6 rounded-xl bg-red-500 px-6 py-2.5 text-sm font-bold text-white"
          >
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900 antialiased">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-100 bg-white p-8 lg:flex">
        <div className="mb-12 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 p-2 text-white shadow-lg shadow-blue-200">
            <Image
              src="/image/logo.png"
              alt="Company Life Helper"
              width={32}
              height={32}
              className="h-7 w-7 object-contain"
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Life Helper</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarTabButton
            icon={<House className="h-4 w-4" />}
            label="대시보드"
            active={activeTab === "home"}
            onClick={() => setActiveTab("home")}
          />
          <SidebarTabButton
            icon={<CalendarDays className="h-4 w-4" />}
            label="팀 일정"
            active={activeTab === "calendar"}
            onClick={() => setActiveTab("calendar")}
          />
          <SidebarTabButton
            icon={<Utensils className="h-4 w-4" />}
            label="점심 추천"
            active={activeTab === "lunch"}
            onClick={() => setActiveTab("lunch")}
          />
          <SidebarTabButton
            icon={<CheckSquare className="h-4 w-4" />}
            label="투표 참여"
            active={activeTab === "vote"}
            onClick={() => setActiveTab("vote")}
          />
        </nav>

        <div className="mt-auto space-y-3 border-t border-slate-100 pt-8">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <Shield className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-bold">{userName || "로딩 중..."} 님</p>
              <p className="text-[10px] font-medium text-slate-400">{teamName || teamId}</p>
            </div>
          </div>
          <button
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-slate-400 transition hover:bg-slate-50 hover:text-red-500"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main content */}
      <section className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-slate-100 bg-white/80 px-6 backdrop-blur-md lg:px-10">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 p-1.5 text-white">
              <Image
                src="/image/logo.png"
                alt="Company Life Helper"
                width={24}
                height={24}
                className="h-5 w-5 object-contain"
              />
            </div>
            <span className="text-lg font-bold">Helper</span>
          </div>
          <h2 className="hidden text-sm font-bold uppercase tracking-widest text-slate-400 lg:block">
            {TAB_TITLES[activeTab]}
          </h2>

          <div className="flex items-center gap-4 md:gap-6">
            <div className="hidden items-center gap-3 rounded-full border border-slate-100 bg-white px-4 py-2 text-sm font-bold shadow-sm sm:flex">
              <CloudSun className="h-4 w-4 text-blue-500" />
              {weather ? (
                <>
                  <span>{weather.temp}°C</span>
                  <span className="text-slate-300">|</span>
                  <span className="font-medium text-slate-600">{weather.label}</span>
                </>
              ) : (
                <span className="font-medium text-slate-400">날씨 로딩 중</span>
              )}
            </div>
            <button className="relative p-2 text-slate-400 transition-colors hover:text-blue-600">
              <Bell className="h-5 w-5" />
              {notices.length > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-red-500" />
              )}
            </button>
          </div>
        </header>

        <div className="custom-scroll flex-1 overflow-y-auto px-6 pb-24 pt-6 lg:px-10 lg:pb-10">
          <div className="mx-auto max-w-5xl space-y-8">

            {/* Home tab */}
            {activeTab === "home" && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-8 lg:col-span-2">
                  {/* Main notice hero */}
                  {mainNotice ? (
                    <section
                      onClick={() => setSelectedNotice(mainNotice)}
                      className="relative cursor-pointer overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-2xl shadow-blue-200 transition-transform hover:scale-[1.01] lg:p-12"
                    >
                      <div className="relative z-10">
                        <span className="mb-4 inline-block rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest">
                          {mainNotice.isPinned ? "📌 고정 공지" : "공지사항"}
                        </span>
                        <h3 className="mb-4 text-2xl font-black leading-tight lg:text-3xl">
                          {mainNotice.title}
                        </h3>
                        <p className="mb-8 max-w-md text-sm text-blue-100 opacity-90 lg:text-base line-clamp-3">
                          {mainNotice.content}
                        </p>
                        <span className="inline-block rounded-full bg-white/20 px-4 py-1.5 text-xs font-bold">
                          자세히 보기 →
                        </span>
                      </div>
                      <div className="pointer-events-none absolute -bottom-10 -right-10 flex h-48 w-48 items-center justify-center rounded-full bg-white/5 text-white/10">
                        <Bell className="h-28 w-28" />
                      </div>
                    </section>
                  ) : (
                    <section className="flex items-center justify-center rounded-[2.5rem] bg-gradient-to-br from-slate-100 to-slate-200 p-12">
                      <p className="text-sm font-medium text-slate-400">등록된 공지사항이 없습니다.</p>
                    </section>
                  )}

                  {/* Recent notices */}
                  {recentNotices.length > 0 && (
                    <section className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
                      <h4 className="mb-6 flex items-center gap-3 text-lg font-bold">
                        <Sparkles className="h-5 w-5 text-blue-500" />
                        최근 공지
                      </h4>
                      <div className="space-y-3">
                        {recentNotices.map((notice) => (
                          <div
                            key={notice.id}
                            onClick={() => setSelectedNotice(notice)}
                            className="group flex cursor-pointer items-center justify-between rounded-2xl bg-slate-50 p-4 transition-colors hover:bg-blue-50/50"
                          >
                            <span className="text-sm font-bold text-slate-700 transition-colors group-hover:text-blue-600 line-clamp-1">
                              {notice.title}
                            </span>
                            <span className="ml-4 shrink-0 text-[10px] font-bold text-slate-400">
                              {new Date(notice.createdAt).toLocaleDateString("ko-KR", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>

                <div className="space-y-8">
                  {/* Weather card */}
                  {weather && <WeatherCard weather={weather} />}

                  {/* Today's schedule */}
                  <section className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
                    <h4 className="mb-6 flex items-center gap-3 text-lg font-bold">
                      <CalendarDays className="h-5 w-5 text-pink-500" />
                      오늘의 일정
                    </h4>
                    {todayEvents.length > 0 ? (
                      <div className="space-y-4">
                        {todayEvents.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center gap-4 rounded-2xl border border-pink-100 bg-pink-50 p-4"
                          >
                            <div className="text-2xl">{event.emoji}</div>
                            <p className="text-sm font-bold text-slate-800">{event.title}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-slate-400">오늘 등록된 일정이 없습니다.</p>
                    )}
                    <button
                      onClick={() => setActiveTab("calendar")}
                      className="mt-6 w-full py-3 text-xs font-bold text-slate-400 underline underline-offset-4 transition-colors hover:text-blue-600"
                    >
                      일정 전체 보기
                    </button>
                  </section>

                  {/* Quick lunch */}
                  <section className="rounded-[2rem] border border-slate-100 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                      <Utensils className="h-6 w-6" />
                    </div>
                    <h4 className="mb-2 font-bold">오늘 뭐 먹지?</h4>
                    <p className="mb-6 text-xs font-medium text-slate-400">
                      결정 장애를 빠르게 끝내드립니다.
                    </p>
                    <button
                      onClick={() => setActiveTab("lunch")}
                      className="w-full rounded-xl bg-orange-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-100 transition-all hover:scale-[1.02] active:scale-95"
                    >
                      메뉴 추천 받기
                    </button>
                  </section>
                </div>
              </div>
            )}

            {/* Lunch tab */}
            {activeTab === "lunch" && (
              <section className="rounded-[2.5rem] border border-slate-100 bg-white p-10 shadow-sm md:p-16">
                <div className="mx-auto max-w-md text-center">
                  <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-orange-50 text-orange-500">
                    <Utensils className={`h-9 w-9 ${isPickingLunch ? "animate-bounce" : ""}`} />
                  </div>
                  <h3 className="mb-4 text-2xl font-black leading-tight">오늘의 점심 룰렛</h3>

                  {/* Work location selector */}
                  {workLocations.length > 0 && (
                    <div className="mb-8">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        근무지 선택
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          onClick={() => { setSelectedWorkLocationId(""); setPickedLunch(null); }}
                          className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                            selectedWorkLocationId === ""
                              ? "bg-orange-500 text-white shadow-md shadow-orange-100"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          전체
                        </button>
                        {workLocations.map((loc) => (
                          <button
                            key={loc.id}
                            onClick={() => { setSelectedWorkLocationId(loc.id); setPickedLunch(null); }}
                            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                              selectedWorkLocationId === loc.id
                                ? "bg-orange-500 text-white shadow-md shadow-orange-100"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            {loc.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="mb-12 text-sm font-medium leading-relaxed text-slate-400">
                    {(() => {
                      const filtered = selectedWorkLocationId
                        ? restaurants.filter((r) => r.workLocationIds?.includes(selectedWorkLocationId) ?? false)
                        : restaurants;
                      if (filtered.length > 0) {
                        const locName = workLocations.find((l) => l.id === selectedWorkLocationId)?.name;
                        return locName
                          ? `${locName} 맛집 ${filtered.length}곳 중에서 골라드립니다.`
                          : `팀 맛집 ${filtered.length}곳 중에서 오늘 점심을 골라드립니다.`;
                      }
                      return "등록된 맛집이 없어 기본 추천 목록을 사용합니다.";
                    })()}
                  </p>

                  {pickedLunch && (
                    <div className="mb-12 overflow-hidden rounded-[2rem] border-2 border-dashed border-orange-200 bg-orange-50">
                      <div className="p-8">
                        <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-orange-500">
                          오늘의 메뉴
                        </span>
                        <h4 className="text-3xl font-black text-slate-900">{pickedLunch.name}</h4>
                        <p className="mt-2 text-sm font-bold text-slate-500">
                          {pickedLunch.category} · ⭐ {pickedLunch.rating} · 도보 {pickedLunch.walkMinutes}분
                        </p>
                        {pickedLunch.address && (
                          <p className="mt-1 text-xs text-slate-400">{pickedLunch.address}</p>
                        )}
                      </div>
                      {pickedLunch.lat && pickedLunch.lon && (
                        <RestaurantMapView lat={pickedLunch.lat} lon={pickedLunch.lon} name={pickedLunch.name} />
                      )}
                    </div>
                  )}

                  <button
                    onClick={pickLunch}
                    disabled={isPickingLunch}
                    className="w-full rounded-3xl bg-orange-500 py-5 text-lg font-black text-white shadow-xl shadow-orange-100 transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-orange-300"
                  >
                    {isPickingLunch ? "추천 메뉴를 고르는 중..." : "랜덤 추천 시작"}
                  </button>
                </div>

                {/* Restaurant list */}
                {(() => {
                  const visible = selectedWorkLocationId
                    ? restaurants.filter((r) => r.workLocationIds?.includes(selectedWorkLocationId) ?? false)
                    : restaurants;
                  if (visible.length === 0) return null;
                  return (
                    <div className="mx-auto mt-12 max-w-md">
                      <p className="mb-4 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">
                        {selectedWorkLocationId
                          ? `${workLocations.find((l) => l.id === selectedWorkLocationId)?.name ?? ""} 맛집 목록`
                          : "팀 맛집 목록"}
                      </p>
                      <div className="space-y-3">
                        {visible.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4"
                          >
                            <span className="text-sm font-bold text-slate-700">{r.name}</span>
                            <span className="text-xs font-medium text-slate-400">
                              {r.category} · ⭐ {r.rating} · {r.walkMinutes}분
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </section>
            )}

            {/* Vote tab */}
            {activeTab === "vote" && (
              <section className="space-y-6">
                <div className="px-2">
                  <h3 className="text-2xl font-black">진행 중인 투표</h3>
                  <p className="mt-1 text-sm font-medium text-slate-400">
                    {polls.length > 0
                      ? `${polls.length}개의 투표가 진행 중입니다.`
                      : "현재 진행 중인 투표가 없습니다."}
                  </p>
                </div>

                {polls.length === 0 ? (
                  <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                    <CheckSquare className="mx-auto mb-4 h-10 w-10 text-slate-200" />
                    <p className="text-sm font-medium text-slate-400">
                      진행 중인 투표가 없습니다.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    {polls.map((poll) => {
                      const myVote = votedPolls[poll.id];
                      const daysLeft = Math.ceil((poll.endsAt - Date.now()) / 86400000);

                      return (
                        <div
                          key={poll.id}
                          className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm"
                        >
                          <div className="mb-6 flex items-center justify-between">
                            <span className="rounded-full bg-green-100 px-3 py-1 text-[10px] font-bold text-green-600">
                              진행 중
                            </span>
                            <span className="text-[10px] font-bold text-slate-300">
                              {daysLeft > 0 ? `D-${daysLeft} 마감` : "마감 임박"}
                            </span>
                          </div>
                          <h4 className="mb-6 text-lg font-bold">{poll.title}</h4>
                          <div className="space-y-3">
                            {poll.options.map((option) => {
                              const percent =
                                poll.totalVotes > 0
                                  ? Math.round((option.votes / poll.totalVotes) * 100)
                                  : 0;
                              const isMyVote = myVote === option.id;
                              const hasVoted = !!myVote;

                              return (
                                <button
                                  key={option.id}
                                  onClick={() => void handleVote(poll.id, option.id)}
                                  disabled={hasVoted || isVoting === poll.id}
                                  className={`group relative h-14 w-full overflow-hidden rounded-2xl border-2 text-left transition-all ${
                                    isMyVote
                                      ? "border-blue-500 bg-blue-50/50"
                                      : hasVoted
                                        ? "cursor-default border-transparent bg-slate-50"
                                        : "border-transparent bg-slate-50 hover:border-blue-500/20 hover:bg-white"
                                  }`}
                                >
                                  <div
                                    className={`absolute inset-y-0 left-0 transition-all duration-700 ${
                                      isMyVote ? "bg-blue-200" : "bg-blue-100"
                                    }`}
                                    style={{ width: `${percent}%` }}
                                  />
                                  <div className="absolute inset-0 flex items-center justify-between px-5 text-sm font-bold">
                                    <span className="flex items-center gap-2 text-slate-700">
                                      {isMyVote && (
                                        <span className="text-blue-500">✓</span>
                                      )}
                                      {option.label}
                                    </span>
                                    <span className="text-blue-600">
                                      {percent}% ({option.votes}명)
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {!myVote && (
                            <p className="mt-4 text-center text-[10px] font-medium text-slate-400">
                              선택지를 클릭해 투표하세요
                            </p>
                          )}
                          {myVote && (
                            <p className="mt-4 text-center text-[10px] font-bold text-blue-500">
                              투표 완료 · 총 {poll.totalVotes}명 참여
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Calendar tab */}
            {activeTab === "calendar" && (
              <section className="rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm lg:p-12">
                <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-2xl font-black">팀 캘린더</h3>
                    <p className="mt-1 text-sm font-medium text-slate-400">
                      중요 일정과 기념일을 한눈에 확인하세요.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-2">
                    <button
                      onClick={prevMonth}
                      className="rounded-xl p-2.5 transition-all hover:bg-white hover:shadow-sm"
                    >
                      <ChevronLeft className="h-4 w-4 text-slate-400" />
                    </button>
                    <span className="px-4 font-bold text-slate-700">
                      {calYear}년 {MONTH_NAMES[calMonth]}
                    </span>
                    <button
                      onClick={nextMonth}
                      className="rounded-xl p-2.5 transition-all hover:bg-white hover:shadow-sm"
                    >
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-3xl border border-slate-100 bg-slate-100 shadow-sm">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div
                      key={day}
                      className="bg-slate-50 p-4 text-center text-[10px] font-black uppercase text-slate-300"
                    >
                      {day}
                    </div>
                  ))}

                  {/* Empty cells before first day */}
                  {Array.from({ length: firstDayOfMonth }, (_, i) => (
                    <div key={`empty-${i}`} className="bg-white" />
                  ))}

                  {/* Day cells */}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const isToday =
                      calYear === now.getFullYear() &&
                      calMonth === now.getMonth() &&
                      day === now.getDate();
                    const dayEvents = monthEvents.filter((e) => {
                      const eDate = new Date(e.date);
                      return (
                        eDate.getFullYear() === calYear &&
                        eDate.getMonth() === calMonth &&
                        eDate.getDate() === day
                      );
                    });

                    return (
                      <div
                        key={day}
                        className="group relative min-h-24 cursor-pointer bg-white p-3 transition-colors hover:bg-blue-50/50 md:min-h-36"
                      >
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                            isToday
                              ? "bg-blue-600 text-white"
                              : dayEvents.length > 0
                                ? "text-blue-600"
                                : "text-slate-400"
                          }`}
                        >
                          {day}
                        </span>
                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 2).map((event) => (
                            <div
                              key={event.id}
                              className="truncate rounded-lg bg-blue-100 p-1 text-[10px] font-bold text-blue-700"
                            >
                              {event.emoji} {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-[10px] font-bold text-slate-400">
                              +{dayEvents.length - 2}개
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Upcoming events list */}
                {(() => {
                  const upcoming = calendarEvents
                    .filter((e) => e.date >= Date.now())
                    .slice(0, 5);
                  if (upcoming.length === 0) return null;
                  return (
                    <div className="mt-8">
                      <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-300">
                        다가오는 일정
                      </p>
                      <div className="space-y-3">
                        {upcoming.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4"
                          >
                            <span className="text-xl">{event.emoji}</span>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{event.title}</p>
                              <p className="text-[10px] font-medium text-slate-400">
                                {new Date(event.date).toLocaleDateString("ko-KR", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </section>
            )}
          </div>
        </div>

        {/* Notice detail modal */}
        {selectedNotice && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setSelectedNotice(null)}
          >
            <div
              className="modal-scroll relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2.5rem] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[2.5rem] bg-white/90 px-8 py-6 backdrop-blur">
                <span className="rounded-full bg-blue-100 px-3 py-1 text-[10px] font-bold text-blue-600">
                  {selectedNotice.isPinned ? "📌 고정 공지" : "공지사항"}
                </span>
                <button
                  onClick={() => setSelectedNotice(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-8 pb-10">
                <h2 className="mb-3 text-2xl font-black leading-tight text-slate-900">
                  {selectedNotice.title}
                </h2>
                <p className="mb-6 text-[10px] font-bold text-slate-400">
                  {new Date(selectedNotice.createdAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                {selectedNotice.imageUrl && (
                  <img
                    src={selectedNotice.imageUrl}
                    alt="공지 이미지"
                    className="mb-6 w-full rounded-2xl object-cover"
                  />
                )}
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
                  {selectedNotice.content}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-20 items-center justify-around border-t border-slate-100 bg-white/90 px-4 pb-4 backdrop-blur-xl lg:hidden">
          <MobileTabButton
            icon={<House className="h-5 w-5" />}
            label="홈"
            active={activeTab === "home"}
            onClick={() => setActiveTab("home")}
          />
          <MobileTabButton
            icon={<CalendarDays className="h-5 w-5" />}
            label="일정"
            active={activeTab === "calendar"}
            onClick={() => setActiveTab("calendar")}
          />
          <MobileTabButton
            icon={<Utensils className="h-5 w-5" />}
            label="점심"
            active={activeTab === "lunch"}
            onClick={() => setActiveTab("lunch")}
          />
          <MobileTabButton
            icon={<CheckSquare className="h-5 w-5" />}
            label="투표"
            active={activeTab === "vote"}
            onClick={() => setActiveTab("vote")}
          />
        </nav>
      </section>
    </main>
  );
}

function RestaurantMapView({ lat, lon }: { lat: number; lon: number; name: string }) {
  const delta = 0.008;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta},${lat - delta},${lon + delta},${lat + delta}&layer=mapnik&marker=${lat},${lon}`;

  return (
    <iframe
      src={src}
      className="h-48 w-full"
      style={{ border: "none" }}
      loading="lazy"
    />
  );
}

function WeatherCard({ weather }: { weather: WeatherData }) {
  const hour = new Date().getHours();

  const timeOfDay =
    hour >= 5 && hour < 7 ? "dawn"
    : hour >= 7 && hour < 12 ? "morning"
    : hour >= 12 && hour < 16 ? "midday"
    : hour >= 16 && hour < 19 ? "afternoon"
    : hour >= 19 && hour < 21 ? "sunset"
    : "night";

  const isNight = timeOfDay === "night";

  const weatherType =
    weather.code === 0 || weather.code === 1 ? "clear"
    : weather.code === 2 || weather.code === 3 ? "cloudy"
    : weather.code >= 45 && weather.code <= 48 ? "fog"
    : weather.code >= 51 && weather.code <= 57 ? "drizzle"
    : (weather.code >= 61 && weather.code <= 67) || (weather.code >= 80 && weather.code <= 82) ? "rain"
    : (weather.code >= 71 && weather.code <= 77) || weather.code === 85 || weather.code === 86 ? "snow"
    : weather.code >= 95 ? "thunder"
    : "cloudy";

  const bg =
    weatherType === "thunder" ? "from-slate-800 via-purple-950 to-slate-900"
    : weatherType === "rain" ? (isNight ? "from-slate-700 via-blue-950 to-slate-800" : "from-slate-500 via-blue-700 to-slate-600")
    : weatherType === "drizzle" ? (isNight ? "from-slate-700 to-blue-900" : "from-slate-400 via-blue-600 to-slate-500")
    : weatherType === "snow" ? (isNight ? "from-slate-700 to-indigo-900" : "from-sky-200 via-slate-200 to-sky-100")
    : weatherType === "fog" ? "from-slate-400 via-slate-300 to-slate-400"
    : weatherType === "cloudy" ? (isNight ? "from-slate-700 to-slate-800" : "from-slate-400 via-slate-500 to-blue-500")
    : timeOfDay === "dawn" ? "from-rose-400 via-orange-300 to-sky-300"
    : timeOfDay === "morning" ? "from-sky-400 via-blue-400 to-sky-500"
    : timeOfDay === "midday" ? "from-sky-400 to-blue-500"
    : timeOfDay === "afternoon" ? "from-amber-400 via-orange-300 to-sky-400"
    : timeOfDay === "sunset" ? "from-rose-500 via-orange-400 to-purple-500"
    : "from-indigo-950 via-blue-950 to-slate-900";

  const isDark = weatherType === "snow" && !isNight ? false : true;
  const tc = isDark ? "text-white" : "text-slate-700";

  const timeLabel =
    timeOfDay === "dawn" ? "🌅 새벽"
    : timeOfDay === "morning" ? "🌤 오전"
    : timeOfDay === "midday" ? "☀️ 낮"
    : timeOfDay === "afternoon" ? "🌇 오후"
    : timeOfDay === "sunset" ? "🌆 저녁"
    : "🌙 야간";

  // Deterministic particle positions (no Math.random — stable across renders)
  const rainDrops = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 43 + 7) % 100,
    delay: ((i * 0.28) % 2).toFixed(2),
    duration: (0.5 + (i * 0.11) % 0.5).toFixed(2),
  }));
  const snowFlakes = Array.from({ length: 14 }, (_, i) => ({
    left: (i * 67 + 5) % 100,
    delay: ((i * 0.35) % 3).toFixed(2),
    duration: (2 + (i * 0.22) % 2).toFixed(2),
    size: 9 + (i * 3) % 9,
  }));
  const stars = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 41 + 3) % 90,
    top: (i * 37 + 5) % 60,
    delay: ((i * 0.4) % 3).toFixed(2),
    size: 1 + (i % 3),
  }));
  const fogStrips = Array.from({ length: 5 }, (_, i) => ({
    top: 15 + i * 16,
    delay: ((i * 1.2) % 4).toFixed(2),
    duration: (5 + i * 1.5).toFixed(1),
    opacity: 0.5 - i * 0.06,
  }));
  const windLines = Array.from({ length: 8 }, (_, i) => ({
    top: (i * 29 + 10) % 85,
    left: (i * 53) % 40,
    width: 30 + (i * 17) % 50,
    delay: ((i * 0.5) % 3).toFixed(2),
    duration: (1.5 + (i * 0.3) % 1.5).toFixed(1),
  }));

  const showClouds = ["cloudy", "rain", "drizzle", "thunder", "fog"].includes(weatherType);

  return (
    <div className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${bg} p-6 shadow-lg`} style={{ minHeight: "190px" }}>
      {/* Effects layer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Rain */}
        {(weatherType === "rain" || weatherType === "drizzle" || weatherType === "thunder") &&
          rainDrops.map((d, i) => (
            <span
              key={i}
              className="weather-rain"
              style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.duration}s`, opacity: weatherType === "drizzle" ? 0.5 : 0.85 }}
            />
          ))}

        {/* Snow */}
        {weatherType === "snow" &&
          snowFlakes.map((s, i) => (
            <span
              key={i}
              className="weather-snow"
              style={{ left: `${s.left}%`, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s`, fontSize: `${s.size}px` }}
            />
          ))}

        {/* Lightning */}
        {weatherType === "thunder" && (
          <>
            <span className="weather-lightning" style={{ left: "28%", animationDelay: "0s" }} />
            <span className="weather-lightning" style={{ left: "62%", animationDelay: "1.8s" }} />
          </>
        )}

        {/* Stars */}
        {isNight && (weatherType === "clear" || weatherType === "cloudy") &&
          stars.map((s, i) => (
            <span
              key={i}
              className="weather-star"
              style={{ left: `${s.left}%`, top: `${s.top}%`, animationDelay: `${s.delay}s`, width: `${s.size}px`, height: `${s.size}px` }}
            />
          ))}

        {/* Fog strips */}
        {weatherType === "fog" &&
          fogStrips.map((f, i) => (
            <span
              key={i}
              className="weather-fog-strip"
              style={{ top: `${f.top}%`, animationDelay: `${f.delay}s`, animationDuration: `${f.duration}s`, opacity: f.opacity }}
            />
          ))}

        {/* Wind lines */}
        {weather.windSpeed >= 8 &&
          windLines.map((w, i) => (
            <span
              key={i}
              className="weather-wind"
              style={{ top: `${w.top}%`, left: `${w.left}%`, width: `${w.width}px`, animationDelay: `${w.delay}s`, animationDuration: `${w.duration}s` }}
            />
          ))}

        {/* Clouds */}
        {showClouds && (
          <>
            <div className="weather-cloud" style={{ top: "18%", left: "4%",  width: "110px", animationDelay: "0s",   animationDuration: "7s" }} />
            <div className="weather-cloud" style={{ top: "28%", left: "42%", width: "86px",  animationDelay: "1.4s", animationDuration: "5.5s" }} />
            <div className="weather-cloud" style={{ top: "12%", right: "4%", width: "96px",  animationDelay: "0.7s", animationDuration: "6.5s" }} />
          </>
        )}

        {/* Celestial objects */}
        {!showClouds && !["rain","thunder","snow","drizzle"].includes(weatherType) && (
          isNight ? (
            <div className="weather-moon" />
          ) : timeOfDay === "dawn" || timeOfDay === "sunset" ? (
            <div className="weather-sun-low" />
          ) : (
            <div className="weather-sun">
              <div className="weather-sun-rays" />
            </div>
          )
        )}
      </div>

      {/* Info */}
      <div className={`relative z-10 ${tc}`}>
        {/* Location + time */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-black opacity-70">📍 {weather.locationName}</p>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-50">{timeLabel}</p>
        </div>

        {/* Temp + wind */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-5xl font-black leading-none">{weather.temp}°</p>
            <p className="mt-1.5 text-sm font-bold opacity-80">{weather.label}</p>
          </div>
          <p className="text-xs font-bold opacity-60">💨 {weather.windSpeed} m/s</p>
        </div>

        {/* Clothing tip */}
        <div className={`mt-4 rounded-xl px-3 py-2 text-xs font-bold ${isDark ? "bg-white/15" : "bg-black/8"}`}>
          👔 {
            weather.temp >= 28 ? "민소매 · 반팔 · 반바지"
            : weather.temp >= 23 ? "반팔 · 얇은 면바지"
            : weather.temp >= 20 ? "얇은 가디건 · 긴팔"
            : weather.temp >= 17 ? "맨투맨 · 후드 · 얇은 자켓"
            : weather.temp >= 12 ? "자켓 · 가디건 · 청바지"
            : weather.temp >= 9  ? "트렌치코트 · 니트"
            : weather.temp >= 5  ? "울 코트 · 히트텍 · 레이어드"
            : "패딩 · 두꺼운 코트 · 목도리 · 장갑"
          }
        </div>

        {/* Rain / snow warning */}
        {(weather.willRain || weather.willSnow) && (
          <div className="mt-2 rounded-xl bg-yellow-400/90 px-3 py-2 text-xs font-bold text-yellow-900">
            {weather.willSnow ? "🌨 오늘 눈 예보 — 미끄럼 주의!" : "☂️ 오늘 비 예보 — 우산을 챙기세요!"}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarTabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-2xl px-5 py-4 font-bold transition-all ${
        active ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MobileTabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 ${
        active ? "text-blue-600" : "text-slate-300"
      }`}
    >
      {icon}
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}
