"use client";

declare global {
  interface Window { kakao: any; }
}

import {
  CalendarDays,
  Check,
  CheckCheck,
  ChartColumn,
  CheckSquare,
  Layers3,
  Loader2,
  Lock,
  Bell,
  MapPin,
  Megaphone,
  Pin,
  PinOff,
  Plus,
  Shield,
  Trash2,
  Utensils,
  UserCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
async function uploadImageToCloudinary(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "notices");
  const res = await fetch("https://api.cloudinary.com/v1_1/dmkjbo1vl/image/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("이미지 업로드에 실패했습니다.");
  const data = await res.json();
  return data.secure_url as string;
}

import { getFirebaseClient } from "@/lib/firebase/config";
import type {
  AdminUser,
  CalendarEvent,
  Feature,
  FrontUser,
  Notice,
  Poll,
  PollOption,
  Restaurant,
  Team,
  UserStatus,
  WorkLocation,
} from "@/types";

type AdminConsoleProps = {
  role: string;
  teamId: string;
};

type AdminPageKey =
  | "dashboard"
  | "members"
  | "admins"
  | "teams"
  | "worklocations"
  | "notices"
  | "restaurants"
  | "polls"
  | "calendar";
type AccountKind = "front" | "admin";

type PendingUserRow = {
  uid: string;
  accountType: AccountKind;
  name: string;
  identifier: string;
  teamId: string;
  status: UserStatus;
  createdAt: number;
};

const FEATURE_LABELS: Record<Feature, string> = {
  weather: "실시간 날씨",
  lunch: "점심 추천",
  vote: "투표",
  notice: "공지사항",
  board: "게시판",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "가입대기",
  approved: "승인",
  locked: "잠금",
  rejected: "반려",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-orange-100 text-orange-600",
  approved: "bg-green-100 text-green-600",
  locked: "bg-red-100 text-red-600",
  rejected: "bg-slate-100 text-slate-500",
};

const PERMISSION_MENU_KEYS: AdminPageKey[] = ["members", "admins", "teams", "worklocations", "notices", "restaurants", "polls", "calendar"];
const PERMISSION_LABELS: Record<string, string> = {
  members: "프론트 회원 관리",
  admins: "관리자 관리",
  teams: "팀 제어",
  worklocations: "근무지 관리",
  notices: "공지사항",
  restaurants: "맛집 관리",
  polls: "투표 관리",
  calendar: "일정 관리",
};

const NAV_ITEMS: {
  key: AdminPageKey;
  label: string;
  icon: typeof ChartColumn;
  group: "management" | "content";
}[] = [
  { key: "dashboard", label: "종합 현황", icon: ChartColumn, group: "management" },
  { key: "members", label: "프론트 회원 관리", icon: Users, group: "management" },
  { key: "admins", label: "관리자 관리", icon: UserCog, group: "management" },
  { key: "teams", label: "팀 및 기능 제어", icon: Layers3, group: "management" },
  { key: "worklocations", label: "근무지 관리", icon: MapPin, group: "content" },
  { key: "notices", label: "공지사항 관리", icon: Megaphone, group: "content" },
  { key: "restaurants", label: "맛집 데이터 관리", icon: Utensils, group: "content" },
  { key: "polls", label: "투표 관리", icon: CheckSquare, group: "content" },
  { key: "calendar", label: "팀 일정 관리", icon: CalendarDays, group: "content" },
];

const EMOJI_OPTIONS = ["📅", "🎉", "🍻", "🏆", "🎂", "✈️", "💼", "🎯", "🔔", "⭐"];
const CATEGORY_OPTIONS = ["한식", "일식", "중식", "양식", "멕시칸", "건강식", "카페", "기타"];

function formatDate(createdAt: number) {
  if (!createdAt) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

function formatDateShort(ts: number) {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(new Date(ts));
}

export default function AdminConsole({ role, teamId }: AdminConsoleProps) {
  const [activePage, setActivePage] = useState<AdminPageKey>("dashboard");

  // Management data
  const [teams, setTeams] = useState<Team[]>([]);
  const [frontUsers, setFrontUsers] = useState<FrontUser[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [workLocations, setWorkLocations] = useState<WorkLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Work location form
  const [showWorkLocationForm, setShowWorkLocationForm] = useState(false);
  const [workLocationForm, setWorkLocationForm] = useState({ name: "", address: "" });
  const [geoSearching, setGeoSearching] = useState(false);
  const [previewCoords, setPreviewCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Content data
  const [notices, setNotices] = useState<Notice[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isContentLoading, setIsContentLoading] = useState(false);

  // Action state
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  // Notice form
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ title: "", content: "", isPinned: false });
  const [noticeImageFile, setNoticeImageFile] = useState<File | null>(null);
  const [noticeImagePreview, setNoticeImagePreview] = useState("");

  // Restaurant form
  const [showRestaurantForm, setShowRestaurantForm] = useState(false);
  const [restaurantForm, setRestaurantForm] = useState({
    name: "",
    category: "한식",
    rating: "4.5",
    walkMinutes: "5",
    workLocationId: "",
    address: "",
  });
  const [restaurantGeoSearching, setRestaurantGeoSearching] = useState(false);
  const [restaurantPreviewCoords, setRestaurantPreviewCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Poll form
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollForm, setPollForm] = useState({
    title: "",
    options: ["", ""],
    endsAt: "",
  });

  // Calendar event form
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", emoji: "📅", date: "" });

  // Member management
  const [memberFilter, setMemberFilter] = useState<"all" | "pending" | "approved" | "locked">("all");
  const [editingTeamUid, setEditingTeamUid] = useState("");
  const [editingTeamValue, setEditingTeamValue] = useState("");

  // Admin management
  const [adminFilter, setAdminFilter] = useState<"all" | "pending" | "approved" | "locked">("all");
  const [editingPermissionsUid, setEditingPermissionsUid] = useState("");
  const [pendingPermissions, setPendingPermissions] = useState<string[]>([]);

  // Load management data on mount
  async function refreshData() {
    const { db } = getFirebaseClient();
    const [teamSnapshot, frontSnapshot, adminSnapshot, wlSnapshot] = await Promise.all([
      getDocs(query(collection(db, "teams"), orderBy("name"))),
      getDocs(query(collection(db, "frontUsers"), orderBy("createdAt", "desc"))),
      getDocs(query(collection(db, "adminUsers"), orderBy("createdAt", "desc"))),
      getDocs(query(collection(db, "workLocations"), orderBy("createdAt", "desc"))),
    ]);
    setTeams(teamSnapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Team, "id">) })));
    setFrontUsers(frontSnapshot.docs.map((d) => d.data() as FrontUser));
    setAdminUsers(adminSnapshot.docs.map((d) => d.data() as AdminUser));
    setWorkLocations(wlSnapshot.docs.map((d) => d.data() as WorkLocation));
  }

  useEffect(() => {
    async function loadAdminData() {
      setIsLoading(true);
      setActionError("");
      try {
        await refreshData();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "관리자 데이터를 불러오지 못했습니다.",
        );
      } finally {
        setIsLoading(false);
      }
    }
    loadAdminData();
  }, []);

  // Load content data when page changes
  useEffect(() => {
    clearMessages();
    if (activePage === "notices") void loadNotices();
    else if (activePage === "restaurants") void loadRestaurants();
    else if (activePage === "polls") void loadPolls();
    else if (activePage === "calendar") void loadCalendarEvents();
  }, [activePage]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearMessages() {
    setActionMessage("");
    setActionError("");
  }

  // --- Content loaders ---

  async function loadNotices() {
    if (!teamId) return;
    setIsContentLoading(true);
    try {
      const { db } = getFirebaseClient();
      const snap = await getDocs(
        query(collection(db, "notices"), where("teamId", "==", teamId)),
      );
      const list = snap.docs.map((d) => d.data() as Notice);
      list.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.createdAt - a.createdAt;
      });
      setNotices(list);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "공지사항을 불러오지 못했습니다.");
    } finally {
      setIsContentLoading(false);
    }
  }

  async function loadRestaurants() {
    if (!teamId) return;
    setIsContentLoading(true);
    try {
      const { db } = getFirebaseClient();
      const snap = await getDocs(
        query(collection(db, "restaurants"), where("teamId", "==", teamId)),
      );
      const list = snap.docs.map((d) => d.data() as Restaurant);
      list.sort((a, b) => b.createdAt - a.createdAt);
      setRestaurants(list);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "맛집 데이터를 불러오지 못했습니다.");
    } finally {
      setIsContentLoading(false);
    }
  }

  async function loadPolls() {
    if (!teamId) return;
    setIsContentLoading(true);
    try {
      const { db } = getFirebaseClient();
      const snap = await getDocs(
        query(collection(db, "polls"), where("teamId", "==", teamId)),
      );
      const list = snap.docs.map((d) => d.data() as Poll);
      list.sort((a, b) => b.createdAt - a.createdAt);
      setPolls(list);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "투표를 불러오지 못했습니다.");
    } finally {
      setIsContentLoading(false);
    }
  }

  async function loadCalendarEvents() {
    if (!teamId) return;
    setIsContentLoading(true);
    try {
      const { db } = getFirebaseClient();
      const snap = await getDocs(
        query(collection(db, "calendarEvents"), where("teamId", "==", teamId)),
      );
      const list = snap.docs.map((d) => d.data() as CalendarEvent);
      list.sort((a, b) => a.date - b.date);
      setCalendarEvents(list);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "일정을 불러오지 못했습니다.");
    } finally {
      setIsContentLoading(false);
    }
  }

  // --- User management ---

  const pendingUsers = useMemo<PendingUserRow[]>(() => {
    const frontRows = frontUsers.map((user) => ({
      uid: user.uid,
      accountType: "front" as const,
      name: user.name,
      identifier: user.email,
      teamId: user.teamId,
      status: user.status,
      createdAt: user.createdAt,
    }));
    const adminRows = adminUsers.map((user) => ({
      uid: user.uid,
      accountType: "admin" as const,
      name: user.name,
      identifier: user.adminId,
      teamId: user.teamId,
      status: user.status,
      createdAt: user.createdAt,
    }));
    return [...frontRows, ...adminRows]
      .filter((u) => u.status === "pending")
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [adminUsers, frontUsers]);

  const totalUsers = frontUsers.length + adminUsers.length;

  async function updateUserStatus(accountType: AccountKind, uid: string, status: UserStatus) {
    const collectionName = accountType === "admin" ? "adminUsers" : "frontUsers";
    const messagePrefix = accountType === "admin" ? "어드민 계정" : "프론트 계정";
    const taskKey = `${accountType}:${uid}:${status}`;
    setBusyKey(taskKey);
    setActionError("");
    setActionMessage("");
    try {
      const { db } = getFirebaseClient();
      await updateDoc(doc(db, collectionName, uid), { status });
      await refreshData();
      setActionMessage(
        `${messagePrefix} 상태를 ${status === "approved" ? "승인" : "반려"}으로 변경했습니다.`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "상태 변경에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function geocodeAddress(address: string, onSuccess: (lat: number, lon: number) => void, onFail: () => void) {
    setGeoSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&accept-language=ko`,
        { headers: { "User-Agent": "company-life-helper-app" } },
      );
      const data = (await res.json()) as { lat: string; lon: string }[];
      if (data.length > 0) {
        onSuccess(parseFloat(data[0].lat), parseFloat(data[0].lon));
      } else {
        onFail();
      }
    } catch {
      onFail();
    } finally {
      setGeoSearching(false);
    }
  }

  async function addWorkLocation(lat: number, lon: number) {
    if (!workLocationForm.name.trim() || !workLocationForm.address.trim()) {
      setActionError("근무지 이름과 주소를 입력해주세요.");
      return;
    }
    setBusyKey("wl-add");
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      const docRef = doc(collection(db, "workLocations"));
      await setDoc(docRef, {
        id: docRef.id,
        name: workLocationForm.name.trim(),
        address: workLocationForm.address.trim(),
        lat,
        lon,
        teamId,
        createdAt: Date.now(),
      });
      setWorkLocationForm({ name: "", address: "" });
      setPreviewCoords(null);
      setShowWorkLocationForm(false);
      await refreshData();
      setActionMessage("근무지가 등록되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "근무지 등록에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function deleteWorkLocation(id: string) {
    setBusyKey(`wl-del:${id}`);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, "workLocations", id));
      await refreshData();
      setActionMessage("근무지가 삭제되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function deleteUser(accountType: AccountKind, uid: string) {
    const collectionName = accountType === "admin" ? "adminUsers" : "frontUsers";
    const taskKey = `del:${accountType}:${uid}`;
    setBusyKey(taskKey);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, collectionName, uid));
      await refreshData();
      setActionMessage("계정이 삭제되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function changeUserTeam(uid: string, newTeamId: string) {
    const taskKey = `team-change:${uid}`;
    setBusyKey(taskKey);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await updateDoc(doc(db, "frontUsers", uid), { teamId: newTeamId });
      await refreshData();
      setEditingTeamUid("");
      setActionMessage("소속 팀이 변경되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "팀 변경에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function saveAdminPermissions(uid: string, permissions: string[]) {
    const taskKey = `permissions:${uid}`;
    setBusyKey(taskKey);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await updateDoc(doc(db, "adminUsers", uid), { permissions });
      await refreshData();
      setEditingPermissionsUid("");
      setActionMessage("권한이 업데이트되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "권한 변경에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function approveAllPending() {
    if (pendingUsers.length === 0) return;
    setBusyKey("bulk-approve");
    setActionError("");
    setActionMessage("");
    try {
      const { db } = getFirebaseClient();
      await Promise.all(
        pendingUsers.map((user) =>
          updateDoc(
            doc(db, user.accountType === "admin" ? "adminUsers" : "frontUsers", user.uid),
            { status: "approved" },
          ),
        ),
      );
      await refreshData();
      setActionMessage("대기 중인 계정을 모두 승인했습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "전체 승인에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function toggleTeamFeature(teamIdValue: string, feature: Feature, enabled: boolean) {
    const taskKey = `team:${teamIdValue}:${feature}`;
    setBusyKey(taskKey);
    setActionError("");
    setActionMessage("");
    try {
      const { db } = getFirebaseClient();
      const targetTeam = teams.find((t) => t.id === teamIdValue);
      if (!targetTeam) throw new Error("팀 정보를 찾을 수 없습니다.");
      const nextFeatures = enabled
        ? targetTeam.features.filter((f) => f !== feature)
        : [...targetTeam.features, feature];
      await updateDoc(doc(db, "teams", teamIdValue), { features: nextFeatures });
      await refreshData();
      setActionMessage("팀 기능 설정을 업데이트했습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "팀 기능 변경에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  // --- Notice operations ---

  async function addNotice() {
    if (!noticeForm.title.trim() || !noticeForm.content.trim()) {
      setActionError("제목과 내용을 모두 입력해주세요.");
      return;
    }
    setBusyKey("notice-add");
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      const docRef = doc(collection(db, "notices"));

      let imageUrl: string | undefined;
      if (noticeImageFile) {
        imageUrl = await uploadImageToCloudinary(noticeImageFile);
      }

      await setDoc(docRef, {
        id: docRef.id,
        title: noticeForm.title.trim(),
        content: noticeForm.content.trim(),
        teamId,
        isPinned: noticeForm.isPinned,
        ...(imageUrl ? { imageUrl } : {}),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setNoticeForm({ title: "", content: "", isPinned: false });
      setNoticeImageFile(null);
      setNoticeImagePreview("");
      setShowNoticeForm(false);
      await loadNotices();
      setActionMessage("공지사항이 등록되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "공지사항 등록에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function deleteNotice(id: string) {
    setBusyKey(`notice-del:${id}`);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, "notices", id));
      await loadNotices();
      setActionMessage("공지사항이 삭제되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function toggleNoticePin(id: string, isPinned: boolean) {
    setBusyKey(`notice-pin:${id}`);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await updateDoc(doc(db, "notices", id), { isPinned: !isPinned, updatedAt: Date.now() });
      await loadNotices();
      setActionMessage(isPinned ? "고정이 해제되었습니다." : "공지사항이 고정되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "고정 변경에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  // --- Restaurant operations ---

  async function addRestaurant() {
    if (!restaurantForm.name.trim()) {
      setActionError("식당 이름을 입력해주세요.");
      return;
    }
    const rating = parseFloat(restaurantForm.rating);
    const walkMinutes = parseInt(restaurantForm.walkMinutes, 10);
    if (isNaN(rating) || rating < 0 || rating > 5) {
      setActionError("평점은 0~5 사이로 입력해주세요.");
      return;
    }
    if (isNaN(walkMinutes) || walkMinutes < 1) {
      setActionError("도보 시간을 1분 이상으로 입력해주세요.");
      return;
    }
    setBusyKey("restaurant-add");
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      const docRef = doc(collection(db, "restaurants"));
      await setDoc(docRef, {
        id: docRef.id,
        name: restaurantForm.name.trim(),
        category: restaurantForm.category,
        rating,
        walkMinutes,
        teamId,
        workLocationId: restaurantForm.workLocationId || "",
        address: restaurantForm.address.trim() || "",
        ...(restaurantPreviewCoords ? { lat: restaurantPreviewCoords.lat, lon: restaurantPreviewCoords.lon } : {}),
        createdAt: Date.now(),
      });
      setRestaurantForm({ name: "", category: "한식", rating: "4.5", walkMinutes: "5", workLocationId: "", address: "" });
      setRestaurantPreviewCoords(null);
      setShowRestaurantForm(false);
      await loadRestaurants();
      setActionMessage("맛집이 등록되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "맛집 등록에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function deleteRestaurant(id: string) {
    setBusyKey(`restaurant-del:${id}`);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, "restaurants", id));
      await loadRestaurants();
      setActionMessage("맛집이 삭제되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  // --- Poll operations ---

  async function addPoll() {
    const validOptions = pollForm.options.filter((o) => o.trim() !== "");
    if (!pollForm.title.trim()) {
      setActionError("투표 제목을 입력해주세요.");
      return;
    }
    if (validOptions.length < 2) {
      setActionError("선택지는 최소 2개 이상 입력해주세요.");
      return;
    }
    if (!pollForm.endsAt) {
      setActionError("마감일을 설정해주세요.");
      return;
    }
    setBusyKey("poll-add");
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      const docRef = doc(collection(db, "polls"));
      const options: PollOption[] = validOptions.map((label, i) => ({
        id: `opt_${i}`,
        label: label.trim(),
        votes: 0,
      }));
      await setDoc(docRef, {
        id: docRef.id,
        title: pollForm.title.trim(),
        teamId,
        status: "active",
        options,
        totalVotes: 0,
        createdAt: Date.now(),
        endsAt: new Date(pollForm.endsAt).getTime(),
      });
      setPollForm({ title: "", options: ["", ""], endsAt: "" });
      setShowPollForm(false);
      await loadPolls();
      setActionMessage("투표가 생성되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "투표 생성에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function endPoll(id: string) {
    setBusyKey(`poll-end:${id}`);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await updateDoc(doc(db, "polls", id), { status: "ended" });
      await loadPolls();
      setActionMessage("투표가 종료되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "투표 종료에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function deletePoll(id: string) {
    setBusyKey(`poll-del:${id}`);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, "polls", id));
      await loadPolls();
      setActionMessage("투표가 삭제되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  // --- Calendar operations ---

  async function addCalendarEvent() {
    if (!eventForm.title.trim()) {
      setActionError("일정 제목을 입력해주세요.");
      return;
    }
    if (!eventForm.date) {
      setActionError("날짜를 선택해주세요.");
      return;
    }
    setBusyKey("event-add");
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      const docRef = doc(collection(db, "calendarEvents"));
      await setDoc(docRef, {
        id: docRef.id,
        title: eventForm.title.trim(),
        emoji: eventForm.emoji,
        date: new Date(eventForm.date).getTime(),
        teamId,
        createdAt: Date.now(),
      });
      setEventForm({ title: "", emoji: "📅", date: "" });
      setShowEventForm(false);
      await loadCalendarEvents();
      setActionMessage("일정이 등록되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "일정 등록에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  async function deleteCalendarEvent(id: string) {
    setBusyKey(`event-del:${id}`);
    clearMessages();
    try {
      const { db } = getFirebaseClient();
      await deleteDoc(doc(db, "calendarEvents", id));
      await loadCalendarEvents();
      setActionMessage("일정이 삭제되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setBusyKey("");
    }
  }

  // --- Render sections ---

  function renderDashboard() {
    return (
      <div className="max-w-6xl space-y-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <MetricCard label="Total Users" value={`${totalUsers}명`} accent="text-slate-900" />
          <MetricCard label="Pending" value={`${pendingUsers.length}명`} accent="text-orange-500" />
          <MetricCard label="Total Teams" value={`${teams.length}개`} accent="text-blue-500" />
          <MetricCard
            label="Admin Accounts"
            value={`${adminUsers.length}명`}
            accent="text-green-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
            <h4 className="mb-6 text-lg font-bold">최근 가입 요청</h4>
            <div className="space-y-4">
              {pendingUsers.slice(0, 4).map((user) => (
                <div
                  key={user.uid}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-bold text-slate-400 shadow-sm">
                      {user.name.slice(0, 1)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {user.name} ({user.identifier})
                      </p>
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        {user.accountType} / {user.teamId}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      startTransition(() =>
                        void updateUserStatus(user.accountType, user.uid, "approved"),
                      )
                    }
                    disabled={busyKey !== ""}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    승인하기
                  </button>
                </div>
              ))}
              {pendingUsers.length === 0 && <EmptyState text="현재 대기 중인 가입 요청이 없습니다." />}
            </div>
          </div>

          <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
            <h4 className="mb-6 text-lg font-bold">시스템 요약</h4>
            <div className="space-y-4">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-2/3 bg-indigo-500" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Team Activation Readiness: {teams.length > 0 ? "67%" : "0%"}
              </p>
              <div className="grid gap-3 rounded-3xl bg-slate-50 p-5 text-sm text-slate-600">
                <p>
                  현재 세션 역할: <span className="font-bold text-slate-900">{role}</span>
                </p>
                <p>
                  현재 세션 팀 ID:{" "}
                  <span className="font-bold text-slate-900">{teamId || "-"}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderMembers() {
    const filtered =
      memberFilter === "all" ? frontUsers : frontUsers.filter((u) => u.status === memberFilter);

    return (
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "approved", "locked"] as const).map((f) => {
            const count = f === "all" ? frontUsers.length : frontUsers.filter((u) => u.status === f).length;
            return (
              <button
                key={f}
                onClick={() => setMemberFilter(f)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  memberFilter === f
                    ? "bg-indigo-600 text-white"
                    : "border border-gray-200 bg-white text-slate-500 hover:border-indigo-300"
                }`}
              >
                {f === "all" ? "전체" : STATUS_LABELS[f]} ({count})
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-[2.5rem] border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 p-8">
            <h3 className="text-xl font-black">프론트 회원 목록</h3>
            <p className="mt-1 text-sm text-slate-400">총 {frontUsers.length}명</p>
          </div>
          <div className="p-8">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-[10px] font-black uppercase tracking-widest text-slate-300">
                  <th className="pb-4">이름 / 이메일</th>
                  <th className="pb-4">소속 팀</th>
                  <th className="pb-4">상태</th>
                  <th className="pb-4">가입일</th>
                  <th className="pb-4 text-right">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((user) => {
                  const isEditingTeam = editingTeamUid === user.uid;
                  return (
                    <tr key={user.uid} className="transition-colors hover:bg-slate-50">
                      <td className="py-4">
                        <p className="text-sm font-bold text-slate-800">{user.name}</p>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </td>
                      <td className="py-4">
                        {isEditingTeam ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={editingTeamValue}
                              onChange={(e) => setEditingTeamValue(e.target.value)}
                              className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                            >
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => startTransition(() => void changeUserTeam(user.uid, editingTeamValue))}
                              disabled={busyKey !== ""}
                              className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                            >
                              {busyKey === `team-change:${user.uid}` ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "저장"}
                            </button>
                            <button
                              onClick={() => setEditingTeamUid("")}
                              className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-slate-400"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingTeamUid(user.uid); setEditingTeamValue(user.teamId); }}
                            className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-100"
                          >
                            {teams.find((t) => t.id === user.teamId)?.name ?? user.teamId}
                          </button>
                        )}
                      </td>
                      <td className="py-4">
                        <select
                          value={user.status}
                          onChange={(e) =>
                            startTransition(() =>
                              void updateUserStatus("front", user.uid, e.target.value as "pending" | "approved" | "locked"),
                            )
                          }
                          disabled={busyKey !== ""}
                          className={`cursor-pointer rounded-full border-0 px-3 py-1 text-[10px] font-bold outline-none ${STATUS_COLORS[user.status] ?? "bg-slate-100 text-slate-500"}`}
                        >
                          <option value="pending">가입대기</option>
                          <option value="approved">승인</option>
                          <option value="locked">잠금</option>
                        </select>
                      </td>
                      <td className="py-4 text-xs font-medium text-slate-400">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="py-4">
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              if (window.confirm(`${user.name} 계정을 삭제하시겠습니까?`)) {
                                startTransition(() => void deleteUser("front", user.uid));
                              }
                            }}
                            disabled={busyKey !== ""}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                          >
                            {busyKey === `del:front:${user.uid}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="pt-6">
                <EmptyState text="해당 조건의 회원이 없습니다." />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderAdmins() {
    const filtered =
      adminFilter === "all" ? adminUsers : adminUsers.filter((u) => u.status === adminFilter);

    return (
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "approved", "locked"] as const).map((f) => {
            const count = f === "all" ? adminUsers.length : adminUsers.filter((u) => u.status === f).length;
            return (
              <button
                key={f}
                onClick={() => setAdminFilter(f)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  adminFilter === f
                    ? "bg-indigo-600 text-white"
                    : "border border-gray-200 bg-white text-slate-500 hover:border-indigo-300"
                }`}
              >
                {f === "all" ? "전체" : STATUS_LABELS[f]} ({count})
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-[2.5rem] border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-50 p-8">
            <h3 className="text-xl font-black">관리자 목록</h3>
            <p className="mt-1 text-sm text-slate-400">총 {adminUsers.length}명</p>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map((admin) => {
              const isEditingPermissions = editingPermissionsUid === admin.uid;
              const currentPermissions = admin.permissions ?? [];
              return (
                <div key={admin.uid} className="p-6 transition-colors hover:bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 font-bold text-indigo-600">
                        {admin.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{admin.name}</p>
                        <p className="text-xs text-slate-400">@{admin.adminId} · {admin.teamId}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-bold ${
                          admin.role === "super_admin"
                            ? "bg-purple-100 text-purple-600"
                            : "bg-indigo-100 text-indigo-600"
                        }`}
                      >
                        {admin.role === "super_admin" ? "최고관리자" : "팀관리자"}
                      </span>
                      <select
                        value={admin.status}
                        onChange={(e) =>
                          startTransition(() =>
                            void updateUserStatus("admin", admin.uid, e.target.value as "pending" | "approved" | "locked"),
                          )
                        }
                        disabled={busyKey !== ""}
                        className={`cursor-pointer rounded-full border-0 px-3 py-1 text-[10px] font-bold outline-none ${STATUS_COLORS[admin.status] ?? "bg-slate-100 text-slate-500"}`}
                      >
                        <option value="pending">승인대기</option>
                        <option value="approved">승인</option>
                        <option value="locked">잠금</option>
                      </select>
                      <button
                        onClick={() => {
                          if (isEditingPermissions) {
                            setEditingPermissionsUid("");
                          } else {
                            setEditingPermissionsUid(admin.uid);
                            setPendingPermissions(currentPermissions);
                          }
                        }}
                        className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                          isEditingPermissions
                            ? "bg-indigo-600 text-white"
                            : "border border-gray-200 bg-white text-slate-500 hover:border-indigo-300"
                        }`}
                      >
                        권한 설정
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`${admin.name} 관리자를 삭제하시겠습니까?`)) {
                            startTransition(() => void deleteUser("admin", admin.uid));
                          }
                        }}
                        disabled={busyKey !== ""}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                      >
                        {busyKey === `del:admin:${admin.uid}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {isEditingPermissions && (
                    <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        접근 권한 설정
                      </p>
                      <div className="mb-4 flex flex-wrap gap-2">
                        {PERMISSION_MENU_KEYS.map((key) => {
                          const checked = pendingPermissions.includes(key);
                          return (
                            <label
                              key={key}
                              className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                                checked
                                  ? "bg-indigo-600 text-white"
                                  : "border border-gray-200 bg-white text-slate-600 hover:border-indigo-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() => {
                                  setPendingPermissions((prev) =>
                                    checked ? prev.filter((p) => p !== key) : [...prev, key],
                                  );
                                }}
                              />
                              {checked && <Check className="h-3.5 w-3.5" />}
                              {PERMISSION_LABELS[key]}
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startTransition(() => void saveAdminPermissions(admin.uid, pendingPermissions))}
                          disabled={busyKey !== ""}
                          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {busyKey === `permissions:${admin.uid}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          저장
                        </button>
                        <button
                          onClick={() => setEditingPermissionsUid("")}
                          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold text-slate-500"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-8">
                <EmptyState text="해당 조건의 관리자가 없습니다." />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderWorkLocations() {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black">근무지 관리</h3>
          <button
            onClick={() => { setShowWorkLocationForm((v) => !v); setPreviewCoords(null); clearMessages(); }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm"
          >
            {showWorkLocationForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showWorkLocationForm ? "취소" : "근무지 추가"}
          </button>
        </div>

        {showWorkLocationForm && (
          <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-8 space-y-4">
            <h4 className="font-bold text-indigo-700">새 근무지 등록</h4>
            <input
              type="text"
              placeholder="근무지 이름 (예: 본사, 강남 오피스)"
              value={workLocationForm.name}
              onChange={(e) => setWorkLocationForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="주소 검색 (예: 서울 강남구 테헤란로 152)"
                value={workLocationForm.address}
                onChange={(e) => setWorkLocationForm((f) => ({ ...f, address: e.target.value }))}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
              />
              <button
                onClick={() => {
                  if (!workLocationForm.address.trim()) { setActionError("주소를 입력해주세요."); return; }
                  void geocodeAddress(
                    workLocationForm.address,
                    (lat, lon) => setPreviewCoords({ lat, lon }),
                    () => setActionError("주소를 찾을 수 없습니다. 더 구체적으로 입력해주세요."),
                  );
                }}
                disabled={geoSearching}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {geoSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                지도 확인
              </button>
            </div>

            {previewCoords && (
              <>
                <KakaoMapView lat={previewCoords.lat} lon={previewCoords.lon} name={workLocationForm.name || "근무지"} height="200px" />
                <button
                  onClick={() => startTransition(() => void addWorkLocation(previewCoords.lat, previewCoords.lon))}
                  disabled={busyKey === "wl-add"}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busyKey === "wl-add" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  저장하기
                </button>
              </>
            )}
          </div>
        )}

        <div className="space-y-4">
          {workLocations.map((wl) => (
            <div key={wl.id} className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
              <div className="flex items-center justify-between p-6">
                <div>
                  <p className="font-bold text-slate-900">{wl.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                    <MapPin className="h-3 w-3" /> {wl.address}
                  </p>
                </div>
                <button
                  onClick={() => { if (window.confirm(`"${wl.name}" 근무지를 삭제할까요?`)) startTransition(() => void deleteWorkLocation(wl.id)); }}
                  disabled={busyKey !== ""}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-slate-300 hover:bg-red-50 hover:text-red-500"
                >
                  {busyKey === `wl-del:${wl.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
              <KakaoMapView lat={wl.lat} lon={wl.lon} name={wl.name} height="180px" />
            </div>
          ))}
          {workLocations.length === 0 && <EmptyState text="등록된 근무지가 없습니다." />}
        </div>
      </div>
    );
  }

  function renderTeams() {
    return (
      <div className="max-w-6xl space-y-8">
        <h3 className="text-2xl font-black">팀별 기능 활성화 설정</h3>
        <div className="grid gap-6">
          {teams.map((team) => (
            <div
              key={team.id}
              className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm"
            >
              <div className="mb-8 flex items-center justify-between border-b border-gray-50 pb-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
                    {team.name.slice(0, 1)}
                  </div>
                  <div>
                    <h4 className="text-xl font-black">{team.name}</h4>
                    <p className="mt-1 text-xs font-bold uppercase text-slate-400">
                      ID: {team.id}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mb-6 text-[10px] font-black uppercase tracking-widest text-slate-300">
                Feature Access Control
              </p>
              <div className="flex flex-wrap gap-3">
                {(Object.keys(FEATURE_LABELS) as Feature[]).map((feature) => {
                  const enabled = team.features.includes(feature);
                  const taskKey = `team:${team.id}:${feature}`;
                  const activeBusy = busyKey === taskKey;
                  return (
                    <button
                      key={feature}
                      onClick={() =>
                        startTransition(() => void toggleTeamFeature(team.id, feature, enabled))
                      }
                      disabled={busyKey !== "" && !activeBusy}
                      className={`flex items-center gap-3 rounded-2xl px-6 py-4 text-sm font-bold transition ${
                        enabled
                          ? "border-2 border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm"
                          : "border-2 border-gray-100 bg-white text-slate-300 hover:border-indigo-200"
                      }`}
                    >
                      <span>{FEATURE_LABELS[feature]}</span>
                      {activeBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : enabled ? (
                        <CheckCheck className="h-4 w-4" />
                      ) : (
                        <Shield className="h-4 w-4 opacity-40" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {teams.length === 0 && <EmptyState text="생성된 팀이 없습니다." />}
        </div>
      </div>
    );
  }

  function renderNotices() {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black">공지사항 관리</h3>
          <button
            onClick={() => {
              setShowNoticeForm((v) => !v);
              clearMessages();
            }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm"
          >
            {showNoticeForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showNoticeForm ? "취소" : "공지 작성"}
          </button>
        </div>

        {showNoticeForm && (
          <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-8 space-y-4">
            <h4 className="font-bold text-indigo-700">새 공지사항</h4>
            <input
              type="text"
              placeholder="제목"
              value={noticeForm.title}
              onChange={(e) => setNoticeForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
            />
            <textarea
              placeholder="내용"
              rows={4}
              value={noticeForm.content}
              onChange={(e) => setNoticeForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
            />
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">이미지 첨부 (선택)</p>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-white p-5 text-sm text-slate-400 transition hover:border-indigo-400 hover:text-indigo-500">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setNoticeImageFile(file);
                    setNoticeImagePreview(URL.createObjectURL(file));
                  }}
                />
                {noticeImagePreview ? (
                  <img
                    src={noticeImagePreview}
                    alt="미리보기"
                    className="max-h-48 rounded-lg object-contain"
                  />
                ) : (
                  <span>클릭하여 이미지 선택</span>
                )}
              </label>
              {noticeImageFile && (
                <button
                  type="button"
                  onClick={() => { setNoticeImageFile(null); setNoticeImagePreview(""); }}
                  className="mt-2 text-xs font-medium text-red-400 hover:text-red-600"
                >
                  이미지 제거
                </button>
              )}
            </div>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={noticeForm.isPinned}
                onChange={(e) => setNoticeForm((f) => ({ ...f, isPinned: e.target.checked }))}
                className="h-4 w-4 rounded"
              />
              상단 고정
            </label>
            <button
              onClick={() => startTransition(() => void addNotice())}
              disabled={busyKey === "notice-add"}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busyKey === "notice-add" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              저장하기
            </button>
          </div>
        )}

        {isContentLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {notices.map((notice) => (
              <div
                key={notice.id}
                className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      {notice.isPinned && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                          📌 고정
                        </span>
                      )}
                      <h4 className="font-bold text-slate-900">{notice.title}</h4>
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2">{notice.content}</p>
                    {notice.imageUrl && (
                      <img
                        src={notice.imageUrl}
                        alt="공지 이미지"
                        className="mt-3 max-h-40 rounded-xl object-cover"
                      />
                    )}
                    <p className="mt-2 text-[10px] font-medium text-slate-300">
                      {formatDate(notice.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() =>
                        startTransition(() => void toggleNoticePin(notice.id, notice.isPinned))
                      }
                      disabled={busyKey !== ""}
                      title={notice.isPinned ? "고정 해제" : "상단 고정"}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-400 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-500"
                    >
                      {busyKey === `notice-pin:${notice.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : notice.isPinned ? (
                        <PinOff className="h-4 w-4" />
                      ) : (
                        <Pin className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() =>
                        startTransition(() => void deleteNotice(notice.id))
                      }
                      disabled={busyKey !== ""}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                    >
                      {busyKey === `notice-del:${notice.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {notices.length === 0 && !isContentLoading && (
              <EmptyState text="등록된 공지사항이 없습니다." />
            )}
          </div>
        )}
      </div>
    );
  }

  function renderRestaurants() {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black">맛집 데이터 관리</h3>
          <button
            onClick={() => {
              setShowRestaurantForm((v) => !v);
              clearMessages();
            }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm"
          >
            {showRestaurantForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showRestaurantForm ? "취소" : "맛집 추가"}
          </button>
        </div>

        {showRestaurantForm && (
          <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-8 space-y-5">
            <h4 className="font-bold text-indigo-700">새 맛집 등록</h4>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* 식당 이름 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">식당 이름 *</label>
                <input
                  type="text"
                  placeholder="예: 강남 순대국밥"
                  value={restaurantForm.name}
                  onChange={(e) => setRestaurantForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
                />
              </div>

              {/* 카테고리 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">카테고리</label>
                <select
                  value={restaurantForm.category}
                  onChange={(e) => setRestaurantForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* 평점 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">평점 (0 ~ 5)</label>
                <input
                  type="number"
                  placeholder="4.5"
                  min="0"
                  max="5"
                  step="0.1"
                  value={restaurantForm.rating}
                  onChange={(e) => setRestaurantForm((f) => ({ ...f, rating: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
                />
              </div>

              {/* 도보 시간 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">근무지에서 도보 시간 (분)</label>
                <input
                  type="number"
                  placeholder="5"
                  min="1"
                  value={restaurantForm.walkMinutes}
                  onChange={(e) => setRestaurantForm((f) => ({ ...f, walkMinutes: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            {/* 근무지 */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">근무지</label>
              <select
                value={restaurantForm.workLocationId}
                onChange={(e) => setRestaurantForm((f) => ({ ...f, workLocationId: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
              >
                <option value="">전체 공통 (근무지 무관)</option>
                {workLocations.map((wl) => (
                  <option key={wl.id} value={wl.id}>{wl.name}</option>
                ))}
              </select>
            </div>

            {/* 주소 + 지도 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">주소 (지도 표시용)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="예: 서울 강남구 테헤란로 152"
                  value={restaurantForm.address}
                  onChange={(e) => { setRestaurantForm((f) => ({ ...f, address: e.target.value })); setRestaurantPreviewCoords(null); }}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
                />
                <button
                  onClick={() => {
                    if (!restaurantForm.address.trim()) { setActionError("주소를 입력해주세요."); return; }
                    void (async () => {
                      setRestaurantGeoSearching(true);
                      try {
                        const res = await fetch(
                          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(restaurantForm.address)}&format=json&limit=1&accept-language=ko`,
                          { headers: { "User-Agent": "company-life-helper-app" } },
                        );
                        const data = (await res.json()) as { lat: string; lon: string }[];
                        if (data.length > 0) {
                          setRestaurantPreviewCoords({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
                        } else {
                          setActionError("주소를 찾을 수 없습니다. 더 구체적으로 입력해주세요.");
                        }
                      } catch {
                        setActionError("주소 검색에 실패했습니다.");
                      } finally {
                        setRestaurantGeoSearching(false);
                      }
                    })();
                  }}
                  disabled={restaurantGeoSearching}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {restaurantGeoSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  지도 확인
                </button>
              </div>
              {restaurantPreviewCoords && (
                <KakaoMapView lat={restaurantPreviewCoords.lat} lon={restaurantPreviewCoords.lon} name={restaurantForm.name || "맛집"} height="200px" />
              )}
            </div>

            <button
              onClick={() => startTransition(() => void addRestaurant())}
              disabled={busyKey === "restaurant-add"}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busyKey === "restaurant-add" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              저장하기
            </button>
          </div>
        )}

        {isContentLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {restaurants.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm"
              >
                <div>
                  <p className="font-bold text-slate-900">{r.name}</p>
                  <p className="mt-1 text-xs font-medium text-slate-400">
                    {r.category} · ⭐ {r.rating} · 도보 {r.walkMinutes}분
                  </p>
                  {r.address && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                      <MapPin className="h-2.5 w-2.5 shrink-0" />{r.address}
                    </p>
                  )}
                  {r.workLocationId && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                      <MapPin className="h-2.5 w-2.5" />
                      {workLocations.find((wl) => wl.id === r.workLocationId)?.name ?? r.workLocationId}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => startTransition(() => void deleteRestaurant(r.id))}
                  disabled={busyKey !== ""}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                >
                  {busyKey === `restaurant-del:${r.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
            {restaurants.length === 0 && !isContentLoading && (
              <div className="col-span-2">
                <EmptyState text="등록된 맛집이 없습니다. 맛집을 추가하면 점심 룰렛에 반영됩니다." />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderPolls() {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black">투표 관리</h3>
          <button
            onClick={() => {
              setShowPollForm((v) => !v);
              clearMessages();
            }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm"
          >
            {showPollForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showPollForm ? "취소" : "투표 만들기"}
          </button>
        </div>

        {showPollForm && (
          <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-8 space-y-4">
            <h4 className="font-bold text-indigo-700">새 투표</h4>
            <input
              type="text"
              placeholder="투표 제목"
              value={pollForm.title}
              onChange={(e) => setPollForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
            />
            <div className="space-y-2">
              <p className="text-xs font-bold text-indigo-600">선택지 (최소 2개, 최대 4개)</p>
              {pollForm.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`선택지 ${i + 1}`}
                    value={opt}
                    onChange={(e) =>
                      setPollForm((f) => ({
                        ...f,
                        options: f.options.map((o, idx) => (idx === i ? e.target.value : o)),
                      }))
                    }
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
                  />
                  {pollForm.options.length > 2 && (
                    <button
                      onClick={() =>
                        setPollForm((f) => ({
                          ...f,
                          options: f.options.filter((_, idx) => idx !== i),
                        }))
                      }
                      className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-300 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {pollForm.options.length < 4 && (
                <button
                  onClick={() =>
                    setPollForm((f) => ({ ...f, options: [...f.options, ""] }))
                  }
                  className="flex items-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-white px-4 py-2.5 text-xs font-bold text-indigo-500"
                >
                  <Plus className="h-3 w-3" />
                  선택지 추가
                </button>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-indigo-600">마감 일시</p>
              <input
                type="datetime-local"
                value={pollForm.endsAt}
                onChange={(e) => setPollForm((f) => ({ ...f, endsAt: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <button
              onClick={() => startTransition(() => void addPoll())}
              disabled={busyKey === "poll-add"}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busyKey === "poll-add" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              투표 생성
            </button>
          </div>
        )}

        {isContentLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {polls.map((poll) => (
              <div
                key={poll.id}
                className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          poll.status === "active"
                            ? "bg-green-100 text-green-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {poll.status === "active" ? "진행 중" : "종료됨"}
                      </span>
                      <span className="text-[10px] font-medium text-slate-400">
                        마감: {formatDate(poll.endsAt)}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900">{poll.title}</h4>
                    <p className="mt-1 text-xs text-slate-400">총 {poll.totalVotes}명 참여</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {poll.status === "active" && (
                      <button
                        onClick={() => startTransition(() => void endPoll(poll.id))}
                        disabled={busyKey !== ""}
                        className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-500 hover:bg-orange-100"
                      >
                        {busyKey === `poll-end:${poll.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "종료"
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => startTransition(() => void deletePoll(poll.id))}
                      disabled={busyKey !== ""}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                    >
                      {busyKey === `poll-del:${poll.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {poll.options.map((opt) => {
                    const percent =
                      poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
                    return (
                      <div key={opt.id} className="relative h-8 overflow-hidden rounded-xl bg-slate-50">
                        <div
                          className="absolute inset-y-0 left-0 bg-indigo-100 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-bold">
                          <span className="text-slate-700">{opt.label}</span>
                          <span className="text-indigo-600">
                            {percent}% ({opt.votes}명)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {polls.length === 0 && !isContentLoading && (
              <EmptyState text="생성된 투표가 없습니다." />
            )}
          </div>
        )}
      </div>
    );
  }

  function renderCalendarEvents() {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-black">팀 일정 관리</h3>
          <button
            onClick={() => {
              setShowEventForm((v) => !v);
              clearMessages();
            }}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm"
          >
            {showEventForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showEventForm ? "취소" : "일정 추가"}
          </button>
        </div>

        {showEventForm && (
          <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50 p-8 space-y-4">
            <h4 className="font-bold text-indigo-700">새 일정</h4>
            <input
              type="text"
              placeholder="일정 제목"
              value={eventForm.title}
              onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
            />
            <div>
              <p className="mb-2 text-xs font-bold text-indigo-600">이모지 선택</p>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setEventForm((f) => ({ ...f, emoji }))}
                    className={`h-10 w-10 rounded-xl text-lg transition ${
                      eventForm.emoji === emoji
                        ? "bg-indigo-200 shadow-sm"
                        : "bg-white hover:bg-slate-100"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="date"
              value={eventForm.date}
              onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => startTransition(() => void addCalendarEvent())}
              disabled={busyKey === "event-add"}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busyKey === "event-add" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              저장하기
            </button>
          </div>
        )}

        {isContentLoading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="space-y-3">
            {calendarEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-2xl">
                    {event.emoji}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{event.title}</p>
                    <p className="text-xs font-medium text-slate-400">
                      {formatDateShort(event.date)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => startTransition(() => void deleteCalendarEvent(event.id))}
                  disabled={busyKey !== ""}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                >
                  {busyKey === `event-del:${event.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
            {calendarEvents.length === 0 && !isContentLoading && (
              <EmptyState text="등록된 팀 일정이 없습니다." />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden bg-[#F3F4F6] text-slate-800">
      <aside className="hidden w-72 shrink-0 flex-col bg-[#1e1b4b] p-8 text-white shadow-2xl lg:flex">
        <div className="mb-12 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500 p-2">
            <Image
              src="/image/CLH_logo.png"
              alt="Admin Console"
              width={40}
              height={40}
              className="h-9 w-9 object-contain"
            />
          </div>
          <span className="text-2xl font-extrabold tracking-tighter">Admin Console</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          <p className="mb-4 px-4 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
            Management
          </p>
          {NAV_ITEMS.filter((item) => item.group === "management").map((item) => (
            <SidebarButton
              key={item.key}
              item={item}
              active={activePage === item.key}
              onClick={() => setActivePage(item.key)}
            />
          ))}

          <p className="mb-4 mt-8 px-4 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
            Content
          </p>
          {NAV_ITEMS.filter((item) => item.group === "content").map((item) => (
            <SidebarButton
              key={item.key}
              item={item}
              active={activePage === item.key}
              onClick={() => setActivePage(item.key)}
            />
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-6">
          <div className="rounded-2xl bg-white/5 p-4 text-sm text-indigo-100">
            현재 세션 역할: <span className="font-bold text-white">{role}</span>
          </div>
        </div>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col">
        <header className="z-10 flex h-20 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 lg:px-10">
          <h2 className="text-xl font-black tracking-tight text-slate-800">
            {NAV_ITEMS.find((item) => item.key === activePage)?.label}
          </h2>
          <div className="flex items-center gap-6">
            <button className="rounded-xl bg-slate-100 p-2 text-slate-500">
              <Bell className="h-5 w-5" />
            </button>
            <div className="text-right">
              <p className="text-xs font-bold leading-none text-slate-900">관리자</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-tighter text-slate-400">
                {role}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <Shield className="h-5 w-5" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          <div className="mx-auto space-y-6">
            {actionMessage && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {actionMessage}
              </div>
            )}
            {actionError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {actionError}
              </div>
            )}

            {isLoading ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-[2.5rem] border border-gray-100 bg-white shadow-sm">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : null}

            {!isLoading && activePage === "dashboard" ? renderDashboard() : null}
            {!isLoading && activePage === "members" ? renderMembers() : null}
            {!isLoading && activePage === "admins" ? renderAdmins() : null}
            {!isLoading && activePage === "worklocations" ? renderWorkLocations() : null}
            {!isLoading && activePage === "teams" ? renderTeams() : null}
            {!isLoading && activePage === "notices" ? renderNotices() : null}
            {!isLoading && activePage === "restaurants" ? renderRestaurants() : null}
            {!isLoading && activePage === "polls" ? renderPolls() : null}
            {!isLoading && activePage === "calendar" ? renderCalendarEvents() : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function SidebarButton({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left font-bold transition-all ${
        active ? "bg-indigo-800 text-white" : "text-indigo-300 hover:bg-white/10"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span>{item.label}</span>
    </button>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
      <p className={`mb-2 text-[10px] font-black uppercase ${accent}`}>{label}</p>
      <h3 className="text-3xl font-black text-slate-900">{value}</h3>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-medium text-slate-500">
      {text}
    </div>
  );
}

function KakaoMapView({ lat, lon, name, height = "180px" }: { lat: number; lon: number; name?: string; height?: string }) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey || !mapRef.current) return;
    const el = mapRef.current;

    function initMap() {
      window.kakao.maps.load(() => {
        const center = new window.kakao.maps.LatLng(lat, lon);
        const map = new window.kakao.maps.Map(el, { center, level: 4 });
        const marker = new window.kakao.maps.Marker({ position: center, map });
        if (name) {
          const info = new window.kakao.maps.InfoWindow({
            content: `<div style="padding:5px 10px;font-size:12px;font-weight:bold;white-space:nowrap;">${name}</div>`,
          });
          info.open(map, marker);
        }
      });
    }

    if (window.kakao?.maps) {
      initMap();
    } else {
      const existing = document.querySelector<HTMLScriptElement>("[data-kakao-sdk]");
      if (existing) {
        if (existing.dataset.loaded === "true") {
          initMap();
        } else {
          existing.addEventListener("load", initMap);
          return () => existing.removeEventListener("load", initMap);
        }
      } else {
        const script = document.createElement("script");
        script.setAttribute("data-kakao-sdk", "true");
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
        script.addEventListener("load", () => { script.dataset.loaded = "true"; initMap(); });
        document.head.appendChild(script);
      }
    }
  }, [lat, lon, name]);

  return <div ref={mapRef} className="w-full rounded-b-[2rem] overflow-hidden" style={{ height }} />;
}
