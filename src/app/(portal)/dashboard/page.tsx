"use client";

import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  House,
  Loader2,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { signOut } from "firebase/auth";

import { getFirebaseClient } from "@/lib/firebase/config";
import { clearClientSession, SESSION_COOKIE_KEYS } from "@/lib/session";
import type { CalendarEvent, Notice, Poll, Restaurant, RestaurantSuggestion, WorkLocation } from "@/types";

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
  { id: "f1", name: "성수 진라멘", category: "일식", rating: 4.8, walkMinutes: 5, teamId: "", externalUrl: "", createdAt: 0 },
  { id: "f2", name: "감성 타코랩", category: "멕시칸", rating: 4.7, walkMinutes: 7, teamId: "", externalUrl: "", createdAt: 0 },
  { id: "f3", name: "오늘의 가정식", category: "한식", rating: 4.5, walkMinutes: 3, teamId: "", externalUrl: "", createdAt: 0 },
  { id: "f4", name: "버거보이", category: "양식", rating: 4.6, walkMinutes: 4, teamId: "", externalUrl: "", createdAt: 0 },
  { id: "f5", name: "샐러드포", category: "건강식", rating: 4.9, walkMinutes: 10, teamId: "", externalUrl: "", createdAt: 0 },
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
  const [rollingName, setRollingName] = useState<string>("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  // Weather
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Work locations
  const [workLocations, setWorkLocations] = useState<WorkLocation[]>([]);
  const [selectedWorkLocationId, setSelectedWorkLocationId] = useState<string>("");

  // Notice detail modal
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  // Calendar event CRUD
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventForm, setEventForm] = useState({ title: "", emoji: "📅", date: "" });
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // Restaurant suggestion
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [suggestionForm, setSuggestionForm] = useState({ restaurantName: "", rating: "4.5", reason: "" });
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);

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
    const q = query(collection(db, "polls"), where("teamId", "in", [teamId, "common"]));
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

  // Close location dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target as Node)) {
        setShowLocationDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
      query(collection(db, "notices"), where("teamId", "in", [teamId, "common"])),
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
      query(collection(db, "calendarEvents"), where("teamId", "in", [teamId, "common"])),
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
    if (list.length > 0) {
      const kdb = list.find((l) => l.name.includes("KDB생명타워"));
      setSelectedWorkLocationId((kdb ?? list[0]).id);
    }
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
    const filtered = restaurants.filter(
      (r) => !selectedWorkLocationId || (r.workLocationIds?.includes(selectedWorkLocationId) ?? false),
    );
    const pool = filtered.length > 0 ? filtered : (restaurants.length > 0 ? restaurants : FALLBACK_RESTAURANTS);
    const finalPick = pool[Math.floor(Math.random() * pool.length)];
    const names = pool.map((r) => r.name);

    setIsPickingLunch(true);
    setPickedLunch(null);
    setRollingName("");

    // Slot machine: fast → medium → slow → land
    const schedule = [
      ...Array(10).fill(65),
      ...Array(7).fill(140),
      ...Array(4).fill(270),
    ];
    let elapsed = 0;
    schedule.forEach((delay, i) => {
      elapsed += delay;
      window.setTimeout(() => setRollingName(names[i % names.length]), elapsed);
    });
    elapsed += 200;
    window.setTimeout(() => {
      setRollingName(finalPick.name);
      window.setTimeout(() => {
        setPickedLunch(finalPick);
        setIsPickingLunch(false);
      }, 480);
    }, elapsed);
  }

  function openAddEvent(dateStr?: string) {
    setEditingEvent(null);
    setEventForm({ title: "", emoji: "📅", date: dateStr ?? "" });
    setShowEventModal(true);
  }

  function openEditEvent(event: CalendarEvent) {
    const d = new Date(event.date);
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setEditingEvent(event);
    setEventForm({ title: event.title, emoji: event.emoji, date: dateStr });
    setShowEventModal(true);
  }

  async function submitEvent() {
    if (!eventForm.title.trim() || !eventForm.date) return;
    setIsSubmittingEvent(true);
    try {
      const { db } = getFirebaseClient();
      const dateTs = new Date(eventForm.date).getTime();
      if (editingEvent) {
        await updateDoc(doc(db, "calendarEvents", editingEvent.id), {
          title: eventForm.title.trim(),
          emoji: eventForm.emoji,
          date: dateTs,
        });
        setCalendarEvents((prev) =>
          prev.map((e) =>
            e.id === editingEvent.id
              ? { ...e, title: eventForm.title.trim(), emoji: eventForm.emoji, date: dateTs }
              : e,
          ),
        );
      } else {
        const ref = await addDoc(collection(db, "calendarEvents"), {
          title: eventForm.title.trim(),
          emoji: eventForm.emoji,
          date: dateTs,
          teamId,
          createdAt: Date.now(),
        });
        setCalendarEvents((prev) => [
          ...prev,
          { id: ref.id, title: eventForm.title.trim(), emoji: eventForm.emoji, date: dateTs, teamId, createdAt: Date.now() },
        ]);
      }
      setShowEventModal(false);
      setEditingEvent(null);
    } catch (err) {
      console.error("[submitEvent]", err);
    } finally {
      setIsSubmittingEvent(false);
    }
  }

  async function deleteEvent(eventId: string) {
    if (!confirm("일정을 삭제하시겠습니까?")) return;
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, "calendarEvents", eventId));
      setCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (err) {
      console.error("[deleteEvent]", err);
    }
  }

  async function submitSuggestion() {
    const name = suggestionForm.restaurantName.trim();
    const reason = suggestionForm.reason.trim();
    if (!name || !reason) return;
    setIsSubmittingSuggestion(true);
    try {
      const { db } = getFirebaseClient();
      const suggestion: Omit<RestaurantSuggestion, "id"> = {
        restaurantName: name,
        rating: parseFloat(suggestionForm.rating),
        reason,
        teamId,
        uid,
        userName,
        status: "pending",
        createdAt: Date.now(),
      };
      await addDoc(collection(db, "restaurantSuggestions"), { ...suggestion, _ts: serverTimestamp() });
      setSuggestionForm({ restaurantName: "", rating: "4.5", reason: "" });
      setShowSuggestionModal(false);
    } catch (err) {
      console.error("[submitSuggestion]", err);
    } finally {
      setIsSubmittingSuggestion(false);
    }
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
        <div className="mb-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 p-2 text-white shadow-lg shadow-blue-200">
              <Image
                src="/image/logo.png"
                alt="Company Life Helper"
                width={32}
                height={32}
                className="h-7 w-7 object-contain"
              />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight">Diware Life Helper</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">디아이웨어</p>
            </div>
          </div>
          {teamName && (
            <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Team</p>
              <p className="mt-0.5 text-sm font-black text-blue-700">{teamName}</p>
            </div>
          )}
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
          <div className="mx-auto max-w-7xl space-y-8">

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
              <section className="relative overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white px-6 py-14 shadow-sm">
                {/* Background decorative food emojis */}
                <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
                  {["🍜", "🍱", "🍔", "🍣", "🌮", "🍛", "🥗", "🍝", "🍤", "🥩"].map((emoji, i) => (
                    <span
                      key={i}
                      className="absolute opacity-[0.15]"
                      style={{
                        top: `${10 + (i * 17) % 80}%`,
                        left: `${5 + (i * 23) % 90}%`,
                        transform: `rotate(${(i * 37) % 60 - 30}deg)`,
                        fontSize: `${2.5 + (i % 3)}rem`,
                      }}
                    >
                      {emoji}
                    </span>
                  ))}
                </div>

                {/* Header */}
                <div className="relative mb-10 text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                    Lunch Roulette 🎰
                  </p>
                  <h3 className="mt-2 text-3xl font-black text-slate-800">오늘 뭐 먹지?</h3>
                </div>

                {/* Two-column layout */}
                <div className="relative flex flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center">

                  {/* Left — controls */}
                  <div className="flex w-full max-w-xs flex-col items-center">
                    {/* Work location selector */}
                    {workLocations.length > 0 && (
                      <div ref={locationDropdownRef} className="relative mb-6 w-full">
                        <button
                          onClick={() => setShowLocationDropdown((v) => !v)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-700 transition-all hover:border-indigo-300 hover:bg-indigo-50"
                        >
                          <span className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-indigo-400" />
                            {workLocations.find((l) => l.id === selectedWorkLocationId)?.name ?? "근무지 선택"}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${showLocationDropdown ? "rotate-180" : ""}`}
                          />
                        </button>
                        {showLocationDropdown && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-200/60">
                            {workLocations.map((loc) => (
                              <button
                                key={loc.id}
                                onClick={() => {
                                  setSelectedWorkLocationId(loc.id);
                                  setPickedLunch(null);
                                  setRollingName("");
                                  setShowLocationDropdown(false);
                                }}
                                className={`flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-bold transition-colors ${
                                  selectedWorkLocationId === loc.id
                                    ? "bg-indigo-50 text-indigo-600"
                                    : "text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <MapPin className="h-4 w-4 shrink-0" />
                                {loc.name}
                                {selectedWorkLocationId === loc.id && (
                                  <span className="ml-auto h-2 w-2 rounded-full bg-indigo-400" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Slot machine */}
                    <div className="mb-6 w-full">
                      {/* Gold outer frame */}
                      <div className="rounded-[2rem] bg-gradient-to-b from-amber-300 via-yellow-500 to-amber-700 p-[3px] shadow-2xl shadow-amber-500/30">
                        {/* Machine body */}
                        <div className="rounded-[calc(2rem-3px)] bg-gradient-to-b from-slate-800 via-slate-900 to-slate-800 px-4 pb-5 pt-4">
                          {/* LED lights */}
                          <div className="mb-4 flex items-center justify-center gap-2">
                            {["bg-red-500","bg-amber-400","bg-green-400","bg-sky-400","bg-violet-500","bg-pink-500","bg-amber-400","bg-green-400"].map((c, i) => (
                              <span
                                key={i}
                                className={`h-2 w-2 rounded-full ${c} transition-opacity duration-300 ${isPickingLunch ? "opacity-100" : "opacity-30"}`}
                                style={isPickingLunch ? { animationDelay: `${i * 80}ms` } : {}}
                              />
                            ))}
                          </div>

                          {/* Reel window */}
                          <div className="overflow-hidden rounded-2xl border-2 border-slate-700 bg-black">
                            <div className="flex divide-x divide-slate-700">
                              {/* Left reel - decorative */}
                              <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 bg-slate-950 py-6">
                                {["🍜","🍔","🍣"].map((e, i) => (
                                  <span
                                    key={i}
                                    className="text-xl leading-none"
                                    style={{
                                      opacity: isPickingLunch ? 1 : 0.25,
                                      filter: isPickingLunch ? "blur(1.5px)" : "none",
                                      transition: "all 0.1s",
                                    }}
                                  >
                                    {e}
                                  </span>
                                ))}
                              </div>

                              {/* Center reel - main */}
                              <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-slate-950 py-8">
                                {/* Glow when spinning */}
                                {isPickingLunch && (
                                  <div className="absolute inset-0 bg-indigo-500/10 shadow-[inset_0_0_30px_rgba(99,102,241,0.4)]" />
                                )}
                                {/* Top & bottom fade */}
                                <div className="absolute left-0 right-0 top-0 z-10 h-8 bg-gradient-to-b from-black to-transparent" />
                                <div className="absolute bottom-0 left-0 right-0 z-10 h-8 bg-gradient-to-t from-black to-transparent" />
                                {/* Center win line */}
                                <div className="absolute left-0 right-0 top-1/2 z-10 -translate-y-px border-t border-amber-400/50" />

                                {isPickingLunch ? (
                                  <p
                                    className="relative z-20 px-4 text-center text-xl font-black leading-tight text-white"
                                    style={{ filter: "blur(0.7px)", transform: "scaleY(0.93)" }}
                                  >
                                    {rollingName || "..."}
                                  </p>
                                ) : pickedLunch ? (
                                  <p className="relative z-20 px-4 text-center text-xl font-black leading-tight text-amber-300">
                                    {pickedLunch.name}
                                  </p>
                                ) : (
                                  <p className="relative z-20 px-4 text-center text-xs font-semibold leading-6 text-slate-600">
                                    버튼을 눌러<br />뽑아보세요!
                                  </p>
                                )}
                              </div>

                              {/* Right reel - decorative */}
                              <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 bg-slate-950 py-6">
                                {["🌮","🥗","🍛"].map((e, i) => (
                                  <span
                                    key={i}
                                    className="text-xl leading-none"
                                    style={{
                                      opacity: isPickingLunch ? 1 : 0.25,
                                      filter: isPickingLunch ? "blur(1.5px)" : "none",
                                      transition: "all 0.1s",
                                    }}
                                  >
                                    {e}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Bottom coin slot decoration */}
                          <div className="mt-4 flex items-center justify-center gap-3">
                            <div className="h-px flex-1 bg-slate-700" />
                            <div className="h-1.5 w-8 rounded-full bg-slate-600" />
                            <div className="h-px flex-1 bg-slate-700" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Spin button */}
                    <button
                      onClick={pickLunch}
                      disabled={isPickingLunch}
                      className="w-full cursor-pointer rounded-2xl bg-indigo-600 px-8 py-4 text-lg font-black text-white shadow-lg shadow-indigo-200 transition-all hover:scale-105 hover:bg-indigo-700 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPickingLunch ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          돌아가는 중...
                        </span>
                      ) : pickedLunch ? (
                        <span className="flex items-center justify-center gap-2">
                          <RefreshCw className="h-5 w-5" />
                          다시 뽑기
                        </span>
                      ) : (
                        "돌려돌려! 🎰"
                      )}
                    </button>
                  </div>

                  {/* Right — result */}
                  <div className="w-full max-w-sm">
                    {pickedLunch && !isPickingLunch ? (
                      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-lg shadow-slate-200/60">
                        <div className="p-6">
                          <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-indigo-400">
                            🎉 오늘의 선택
                          </p>
                          <div className="flex items-start gap-2">
                            <h4 className="text-2xl font-black text-slate-900">{pickedLunch.name}</h4>
                            {pickedLunch.externalUrl && (
                              <a
                                href={pickedLunch.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 shrink-0 rounded-lg bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600 transition hover:bg-green-100"
                              >
                                네이버 ↗
                              </a>
                            )}
                          </div>
                          <p className="mt-2 text-xs font-bold text-slate-500">
                            {pickedLunch.category} · ⭐ {pickedLunch.rating} · 도보 {pickedLunch.walkMinutes}분
                          </p>
                          {pickedLunch.address && (
                            <p className="mt-1 text-xs text-slate-400">{pickedLunch.address}</p>
                          )}
                          {pickedLunch.recommendedMenus && (
                            <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-500">
                              🍽 {pickedLunch.recommendedMenus}
                            </p>
                          )}
                          {pickedLunch.notes && (
                            <p className="mt-2 text-xs italic text-slate-400">💬 {pickedLunch.notes}</p>
                          )}
                        </div>
                        {pickedLunch.lat && pickedLunch.lon && (
                          <RestaurantMapView lat={pickedLunch.lat} lon={pickedLunch.lon} name={pickedLunch.name} />
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/50">
                        <p className="text-3xl">🍽</p>
                        <p className="mt-3 text-sm font-bold text-slate-300">결과가 여기에 표시돼요</p>
                      </div>
                    )}
                  </div>

                </div>

                {/* Suggestion button */}
                <div className="relative mt-8 flex justify-center">
                  <button
                    onClick={() => setShowSuggestionModal(true)}
                    className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-bold text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
                  >
                    🍽 가고 싶은 식당 추천하기
                  </button>
                </div>

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
              <section className="flex flex-col gap-6 lg:flex-row lg:items-start">

                {/* Left — calendar */}
                <div className="flex-1 overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white p-8 shadow-sm">
                  <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-2xl font-black">팀 캘린더</h3>
                      <p className="mt-1 text-sm font-medium text-slate-400">
                        중요 일정과 기념일을 한눈에 확인하세요.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 rounded-2xl bg-slate-50 p-2">
                        <button
                          onClick={prevMonth}
                          className="cursor-pointer rounded-xl p-2.5 transition-all hover:bg-white hover:shadow-sm"
                        >
                          <ChevronLeft className="h-4 w-4 text-slate-400" />
                        </button>
                        <span className="px-3 font-bold text-slate-700">
                          {calYear}년 {MONTH_NAMES[calMonth]}
                        </span>
                        <button
                          onClick={nextMonth}
                          className="cursor-pointer rounded-xl p-2.5 transition-all hover:bg-white hover:shadow-sm"
                        >
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        </button>
                      </div>
                      <button
                        onClick={() => openAddEvent()}
                        className="flex cursor-pointer items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" />
                        일정 추가
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-px overflow-hidden rounded-3xl border border-slate-100 bg-slate-100 shadow-sm">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                      <div
                        key={day}
                        className="bg-slate-50 p-3 text-center text-[10px] font-black uppercase text-slate-300"
                      >
                        {day}
                      </div>
                    ))}

                    {Array.from({ length: firstDayOfMonth }, (_, i) => (
                      <div key={`empty-${i}`} className="bg-white" />
                    ))}

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

                      const pad = (n: number) => String(n).padStart(2, "0");
                      const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;

                      return (
                        <div
                          key={day}
                          onClick={() => openAddEvent(dateStr)}
                          className="group relative min-h-20 cursor-pointer bg-white p-2 transition-colors hover:bg-blue-50/50"
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
                          <div className="mt-1 space-y-0.5">
                            {dayEvents.slice(0, 2).map((event) => (
                              <div
                                key={event.id}
                                onClick={(e) => { e.stopPropagation(); openEditEvent(event); }}
                                className="truncate rounded-md bg-blue-100 px-1 py-0.5 text-[9px] font-bold text-blue-700 hover:bg-blue-200"
                              >
                                {event.emoji} {event.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-[9px] font-bold text-slate-400">
                                +{dayEvents.length - 2}개
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right — panels */}
                <div className="flex w-full shrink-0 flex-col gap-6 lg:w-72">

                {/* Today's events */}
                <div className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800">오늘의 일정</h4>
                      <p className="text-[10px] font-medium text-slate-400">
                        {now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
                      </p>
                    </div>
                  </div>
                  {todayEvents.length > 0 ? (
                    <div className="space-y-2">
                      {todayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="group flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"
                        >
                          <span className="text-lg leading-none">{event.emoji}</span>
                          <p className="flex-1 truncate text-sm font-bold text-slate-800">{event.title}</p>
                          <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                            <button
                              onClick={() => openEditEvent(event)}
                              className="cursor-pointer rounded-lg p-1 text-blue-300 hover:bg-blue-100 hover:text-blue-600"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => void deleteEvent(event.id)}
                              className="cursor-pointer rounded-lg p-1 text-blue-300 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-6 text-center">
                      <p className="text-2xl">☀️</p>
                      <p className="mt-2 text-xs font-medium text-slate-300">오늘 등록된 일정이 없어요</p>
                    </div>
                  )}
                </div>

                {/* Upcoming events */}
                <div className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="mb-6 flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-blue-500" />
                    <h4 className="font-black text-slate-800">다가오는 일정</h4>
                  </div>
                  {(() => {
                    const upcoming = calendarEvents
                      .filter((e) => e.date >= Date.now())
                      .sort((a, b) => a.date - b.date)
                      .slice(0, 8);
                    if (upcoming.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <p className="text-3xl">📭</p>
                          <p className="mt-3 text-sm font-medium text-slate-300">예정된 일정이 없어요</p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {upcoming.map((event) => {
                          const d = new Date(event.date);
                          const diffDays = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          return (
                            <div
                              key={event.id}
                              className="group flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                            >
                              <span className="mt-0.5 text-lg leading-none">{event.emoji}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-slate-800">{event.title}</p>
                                <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                                  {d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                                  diffDays === 0
                                    ? "bg-red-100 text-red-500"
                                    : diffDays <= 3
                                      ? "bg-orange-100 text-orange-500"
                                      : "bg-slate-100 text-slate-400"
                                }`}>
                                  {diffDays === 0 ? "오늘" : `D-${diffDays}`}
                                </span>
                                <button
                                  onClick={() => openEditEvent(event)}
                                  className="cursor-pointer rounded-lg p-1 text-slate-300 opacity-0 transition hover:bg-blue-50 hover:text-blue-500 group-hover:opacity-100"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => void deleteEvent(event.id)}
                                  className="cursor-pointer rounded-lg p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                </div>{/* end right panels */}

              </section>
            )}
          </div>
        </div>

        {/* Calendar event modal */}
        {showEventModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => { setShowEventModal(false); setEditingEvent(null); }}
          >
            <div
              className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {editingEvent ? "일정 수정" : "일정 추가"} 📅
                  </h3>
                  <p className="mt-1 text-xs font-medium text-slate-400">팀 일정을 등록해보세요</p>
                </div>
                <button
                  onClick={() => { setShowEventModal(false); setEditingEvent(null); }}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Emoji picker */}
                <div>
                  <span className="mb-2 block text-sm font-bold text-slate-700">이모지</span>
                  <div className="flex flex-wrap gap-2">
                    {["📅", "🎉", "🍻", "🏆", "🎂", "✈️", "💼", "🎯", "🔔", "⭐", "🎤", "🤝"].map((e) => (
                      <button
                        key={e}
                        onClick={() => setEventForm((f) => ({ ...f, emoji: e }))}
                        className={`cursor-pointer rounded-xl px-3 py-2 text-lg transition ${
                          eventForm.emoji === e
                            ? "bg-blue-100 ring-2 ring-blue-400"
                            : "bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">일정 제목 *</span>
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    placeholder="일정 이름을 입력하세요"
                    value={eventForm.title}
                    onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">날짜 *</span>
                  <input
                    type="date"
                    className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    value={eventForm.date}
                    onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </label>
              </div>

              <div className="mt-6 flex gap-3">
                {editingEvent && (
                  <button
                    onClick={() => { void deleteEvent(editingEvent.id); setShowEventModal(false); }}
                    className="flex cursor-pointer items-center gap-2 rounded-2xl border border-red-200 px-5 py-4 text-sm font-bold text-red-500 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    삭제
                  </button>
                )}
                <button
                  onClick={() => void submitEvent()}
                  disabled={isSubmittingEvent || !eventForm.title.trim() || !eventForm.date}
                  className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmittingEvent ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isSubmittingEvent ? "저장 중..." : editingEvent ? "수정 완료" : "일정 추가"}
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Restaurant suggestion modal */}
        {showSuggestionModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setShowSuggestionModal(false)}
          >
            <div
              className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-900">식당 추천하기 🍽</h3>
                  <p className="mt-1 text-xs font-medium text-slate-400">관리자가 검토 후 맛집 목록에 추가해드려요</p>
                </div>
                <button
                  onClick={() => setShowSuggestionModal(false)}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">식당 이름 *</span>
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="추천할 식당 이름을 입력하세요"
                    value={suggestionForm.restaurantName}
                    onChange={(e) => setSuggestionForm((f) => ({ ...f, restaurantName: e.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">평점</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.5"
                      className="flex-1 cursor-pointer accent-indigo-500"
                      value={suggestionForm.rating}
                      onChange={(e) => setSuggestionForm((f) => ({ ...f, rating: e.target.value }))}
                    />
                    <span className="w-10 text-center text-lg font-black text-indigo-600">
                      {suggestionForm.rating}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-slate-300 font-medium">
                    <span>1.0</span><span>5.0</span>
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-700">추천 이유 *</span>
                  <textarea
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    placeholder="어떤 점이 좋았는지 알려주세요"
                    value={suggestionForm.reason}
                    onChange={(e) => setSuggestionForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </label>
              </div>

              <button
                onClick={() => void submitSuggestion()}
                disabled={isSubmittingSuggestion || !suggestionForm.restaurantName.trim() || !suggestionForm.reason.trim()}
                className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white shadow-lg shadow-indigo-100 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmittingSuggestion ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmittingSuggestion ? "저장 중..." : "추천 제출하기"}
              </button>
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
