import { create } from "zustand";

interface UiState {
  // Property selection
  selectedPropertyId: string | null;
  setSelectedProperty: (id: string | null) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Sidebar panel — "evidence" | "timeline" | "upload" | "detail"
  activePanel: string;
  setActivePanel: (panel: string) => void;

  // Mobile sidebar toggle
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedPropertyId: null,
  setSelectedProperty: (id) =>
    set({ selectedPropertyId: id, activePanel: "detail" }),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  activePanel: "evidence",
  setActivePanel: (panel) => set({ activePanel: panel }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
