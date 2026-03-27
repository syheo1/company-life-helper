export type Feature = "weather" | "lunch" | "vote" | "notice" | "board";

export type UserStatus = "pending" | "approved" | "rejected" | "locked";
export type AdminRole = "team_admin" | "super_admin";
export type AccountType = "front" | "admin";

export interface FrontUser {
  uid: string;
  email: string;
  name: string;
  teamId: string;
  status: UserStatus;
  createdAt: number;
}

export interface AdminUser {
  uid: string;
  adminId: string;
  email: string;
  name: string;
  teamId: string;
  role: AdminRole;
  status: UserStatus;
  createdAt: number;
  permissions?: string[];
}

export interface Team {
  id: string;
  name: string;
  features: Feature[];
  createdAt: number;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  teamId: string;
  isPinned: boolean;
  imageUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  emoji: string;
  date: number;
  teamId: string;
  createdAt: number;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface Poll {
  id: string;
  title: string;
  teamId: string;
  status: "active" | "ended";
  options: PollOption[];
  totalVotes: number;
  createdAt: number;
  endsAt: number;
}

export interface Restaurant {
  id: string;
  name: string;
  category: string;
  rating: number;
  walkMinutes: number;
  teamId: string;
  workLocationIds?: string[];
  address?: string;
  lat?: number;
  lon?: number;
  externalUrl: string;
  recommendedMenus?: string;
  notes?: string;
  createdAt: number;
}

export interface WorkLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  teamId: string;
  createdAt: number;
}
