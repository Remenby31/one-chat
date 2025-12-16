/**
 * Branch Store
 *
 * Zustand store for managing active branch selections.
 * Tracks which sibling index is active for each sibling group.
 */

import { create } from 'zustand'

interface BranchState {
  /** Active branch selections: siblingGroupId -> activeIndex */
  activeBranches: Record<string, number>

  /** Set the active branch for a sibling group */
  setActiveBranch: (groupId: string, index: number) => void

  /** Get the active branch index for a sibling group (default 0) */
  getActiveBranch: (groupId: string) => number

  /** Load branch selections (when switching threads) */
  loadBranches: (branches: Record<string, number>) => void

  /** Clear all branch selections (when clearing chat) */
  clearBranches: () => void

  /** Navigate to previous sibling */
  navigatePrevious: (groupId: string) => void

  /** Navigate to next sibling */
  navigateNext: (groupId: string, maxIndex: number) => void
}

export const useBranchStore = create<BranchState>((set, get) => ({
  activeBranches: {},

  setActiveBranch: (groupId, index) => {
    set((state) => ({
      activeBranches: { ...state.activeBranches, [groupId]: index },
    }))
  },

  getActiveBranch: (groupId) => {
    return get().activeBranches[groupId] ?? 0
  },

  loadBranches: (branches) => {
    set({ activeBranches: branches })
  },

  clearBranches: () => {
    set({ activeBranches: {} })
  },

  navigatePrevious: (groupId) => {
    const currentIndex = get().activeBranches[groupId] ?? 0
    if (currentIndex > 0) {
      set((state) => ({
        activeBranches: { ...state.activeBranches, [groupId]: currentIndex - 1 },
      }))
    }
  },

  navigateNext: (groupId, maxIndex) => {
    const currentIndex = get().activeBranches[groupId] ?? 0
    if (currentIndex < maxIndex) {
      set((state) => ({
        activeBranches: { ...state.activeBranches, [groupId]: currentIndex + 1 },
      }))
    }
  },
}))
