import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { ActivityItem, Chain, Palette, Priority, RepeatRule, Subtask, Task, ThemeMode } from './types'

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function makeTask(title: string): Task {
  return {
    id: uid(), title, description: '', completed: false, priority: 'medium', dueDate: '', reminderAt: '',
    subtasks: [], createdAt: now(), completedAt: null, dependsOn: [], repeat: 'none', estimateMinutes: null,
  }
}

function shiftDate(value: string, repeat: RepeatRule): string {
  if (!value || repeat === 'none') return ''
  const date = new Date(`${value}T12:00:00`)
  if (repeat === 'daily') date.setDate(date.getDate() + 1)
  if (repeat === 'weekly') date.setDate(date.getDate() + 7)
  if (repeat === 'monthly') date.setMonth(date.getMonth() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shiftReminder(value: string, repeat: RepeatRule): string {
  if (!value || repeat === 'none') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (repeat === 'daily') date.setDate(date.getDate() + 1)
  if (repeat === 'weekly') date.setDate(date.getDate() + 7)
  if (repeat === 'monthly') date.setMonth(date.getMonth() + 1)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return items
  next.splice(to, 0, moved)
  return next
}

function createIndexedDbStorage(): StateStorage {
  const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is unavailable')); return }
    const request = indexedDB.open('liniya-local-data', 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  const read = async (key: string): Promise<string | null> => {
    try {
      const db = await dbPromise
      return await new Promise((resolve, reject) => {
        const request = db.transaction('settings', 'readonly').objectStore('settings').get(key)
        request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null)
        request.onerror = () => reject(request.error)
      })
    } catch {
      return localStorage.getItem(key)
    }
  }
  const write = async (key: string, value: string): Promise<void> => {
    try {
      const db = await dbPromise
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite')
        transaction.objectStore('settings').put(value, key)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
    } catch {
      localStorage.setItem(key, value)
    }
  }
  const remove = async (key: string): Promise<void> => {
    try {
      const db = await dbPromise
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('settings', 'readwrite')
        transaction.objectStore('settings').delete(key)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
    } catch {
      localStorage.removeItem(key)
    }
  }

  return {
    getItem: async (name) => {
      const current = await read(name)
      if (current) return current
      const localFallback = localStorage.getItem(name)
      if (localFallback) return localFallback
      // Migrate data from the first prototype, which stored Zustand state in localStorage.
      const legacy = localStorage.getItem('liniya-todo-v1')
      if (legacy) {
        await write(name, legacy)
        return legacy
      }
      return null
    },
    setItem: write,
    removeItem: remove,
  }
}

const safeStorage = createJSONStorage<AppState>(() => createIndexedDbStorage())

function snapshot(state: AppState, label: string) {
  return { undoSnapshot: { chains: state.chains, selectedChainId: state.selectedChainId, label } }
}

type AppState = {
  chains: Chain[]
  selectedChainId: string | null
  themeMode: ThemeMode
  palette: Palette
  activity: ActivityItem[]
  undoSnapshot: { chains: Chain[]; selectedChainId: string | null; label: string } | null
  hasHydrated: boolean
  setHasHydrated: (value: boolean) => void
  createChain: (input: Pick<Chain, 'title' | 'description' | 'color' | 'mode'>, taskSeeds?: Array<string | { title: string; description?: string; priority?: Priority; dependsOnIndices?: number[] }>) => string
  updateChain: (id: string, input: Partial<Pick<Chain, 'title' | 'description' | 'color' | 'mode'>>) => void
  deleteChain: (id: string) => void
  archiveChain: (id: string) => void
  selectChain: (id: string | null) => void
  addTask: (chainId: string, title: string) => string
  updateTask: (chainId: string, taskId: string, input: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'dueDate' | 'reminderAt' | 'dependsOn' | 'repeat' | 'estimateMinutes'>>) => void
  toggleTask: (chainId: string, taskId: string) => boolean
  deleteTask: (chainId: string, taskId: string) => void
  reorderTasks: (chainId: string, from: number, to: number) => void
  addSubtask: (chainId: string, taskId: string, title: string) => void
  toggleSubtask: (chainId: string, taskId: string, subtaskId: string) => void
  deleteSubtask: (chainId: string, taskId: string, subtaskId: string) => void
  setThemeMode: (mode: ThemeMode) => void
  toggleThemeMode: () => void
  setPalette: (palette: Palette) => void
  importChains: (chains: Chain[]) => void
  clearCompleted: (chainId: string) => void
  restoreChain: (id: string) => void
  undoLast: () => string | null
  addActivity: (text: string, chainId?: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      chains: [],
      selectedChainId: null,
      themeMode: 'light',
      palette: 'violet',
      activity: [],
      undoSnapshot: null,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      createChain: (input: Pick<Chain, 'title' | 'description' | 'color' | 'mode'>, taskSeeds: Array<string | { title: string; description?: string; priority?: Priority; dependsOnIndices?: number[] }> = []) => {
        const id = uid()
        const taskIds = taskSeeds.map(() => uid())
        const tasks = taskSeeds.map((seed, index) => {
          const task = { ...makeTask(typeof seed === 'string' ? seed : seed.title), id: taskIds[index] }
          if (typeof seed === 'string') return task
          return {
            ...task,
            description: seed.description ?? '',
            priority: seed.priority ?? 'medium',
            dependsOn: (seed.dependsOnIndices ?? []).filter((dependencyIndex) => Number.isInteger(dependencyIndex) && dependencyIndex >= 0 && dependencyIndex < index).map((dependencyIndex) => taskIds[dependencyIndex]),
          }
        })
        const chain: Chain = { ...input, id, tasks, createdAt: now(), archived: false }
        set((state) => ({ chains: [chain, ...state.chains], selectedChainId: id, ...snapshot(state, 'Создание цепочки') }))
        get().addActivity(`Создана цепочка «${input.title}»`, id)
        return id
      },
      updateChain: (id, input) => {
        const title = get().chains.find((chain) => chain.id === id)?.title ?? 'цепочка'
        set((state) => ({ ...snapshot(state, 'Изменение цепочки'), chains: state.chains.map((chain) => chain.id === id ? { ...chain, ...input } : chain) }))
        get().addActivity(`Обновлены настройки цепочки «${input.title ?? title}»`, id)
      },
      deleteChain: (id) => {
        const title = get().chains.find((chain) => chain.id === id)?.title ?? 'цепочка'
        set((state) => {
          const chains = state.chains.filter((chain) => chain.id !== id)
          return { ...snapshot(state, 'Удаление цепочки'), chains, selectedChainId: state.selectedChainId === id ? (chains[0]?.id ?? null) : state.selectedChainId }
        })
        get().addActivity(`Удалена цепочка «${title}»`, id)
      },
      archiveChain: (id) => {
        const chain = get().chains.find((item) => item.id === id)
        set((state) => {
          const chains = state.chains.map((item) => item.id === id ? { ...item, archived: !item.archived } : item)
          return { ...snapshot(state, 'Перемещение цепочки в архив'), chains, selectedChainId: state.selectedChainId === id ? null : state.selectedChainId }
        })
        if (chain) get().addActivity(chain.archived ? `Восстановлена цепочка «${chain.title}»` : `Цепочка «${chain.title}» перемещена в архив`, id)
      },
      restoreChain: (id) => {
        const title = get().chains.find((chain) => chain.id === id)?.title ?? 'цепочка'
        set((state) => ({ ...snapshot(state, 'Восстановление цепочки'), chains: state.chains.map((chain) => chain.id === id ? { ...chain, archived: false } : chain), selectedChainId: id }))
        get().addActivity(`Восстановлена цепочка «${title}»`, id)
      },
      selectChain: (id) => set({ selectedChainId: id }),
      addTask: (chainId, title) => {
        const task = makeTask(title)
        set((state) => ({ ...snapshot(state, 'Добавление задачи'), chains: state.chains.map((chain) => chain.id === chainId ? { ...chain, tasks: [...chain.tasks, task] } : chain) }))
        get().addActivity(`Добавлена задача «${title}»`, chainId)
        return task.id
      },
      updateTask: (chainId, taskId, input) => {
        const title = get().chains.find((chain) => chain.id === chainId)?.tasks.find((task) => task.id === taskId)?.title ?? 'задача'
        set((state) => ({
          ...snapshot(state, 'Изменение задачи'),
          chains: state.chains.map((chain) => chain.id === chainId ? { ...chain, tasks: chain.tasks.map((task) => task.id === taskId ? { ...task, ...input } : task) } : chain),
        }))
        get().addActivity(`Обновлена задача «${input.title ?? title}»`, chainId)
      },
      toggleTask: (chainId, taskId) => {
        const chain = get().chains.find((item) => item.id === chainId)
        const taskIndex = chain?.tasks.findIndex((task) => task.id === taskId) ?? -1
        const task = chain?.tasks[taskIndex]
        if (!chain || !task || taskIndex < 0) return false
        const locked = chain.mode === 'sequential'
          ? chain.tasks.slice(0, taskIndex).some((item) => !item.completed)
          : chain.mode === 'dependencies'
            ? task.dependsOn.some((id) => !chain.tasks.find((item) => item.id === id)?.completed)
            : false
        if (!task.completed && locked) return false
        set((state) => ({
          ...snapshot(state, task.completed ? 'Возврат задачи в работу' : 'Завершение задачи'),
          chains: state.chains.map((item) => {
            if (item.id !== chainId) return item
            const updated = item.tasks.map((candidate) => candidate.id === taskId ? { ...candidate, completed: !candidate.completed, completedAt: !candidate.completed ? now() : null } : candidate)
            if (!task.completed && task.repeat !== 'none') {
              const nextDate = shiftDate(task.dueDate || new Date().toISOString().slice(0, 10), task.repeat)
              updated.push({ ...task, id: uid(), dueDate: nextDate, reminderAt: shiftReminder(task.reminderAt ?? '', task.repeat), completed: false, completedAt: null, createdAt: now(), dependsOn: [] })
            }
            return { ...item, tasks: updated }
          }),
        }))
        get().addActivity(task.completed ? `Задача возвращена в работу: «${task.title}»` : `Выполнена задача: «${task.title}»`, chainId)
        return true
      },
      deleteTask: (chainId, taskId) => {
        const title = get().chains.find((chain) => chain.id === chainId)?.tasks.find((task) => task.id === taskId)?.title ?? 'задача'
        set((state) => ({
          ...snapshot(state, 'Удаление задачи'),
          chains: state.chains.map((chain) => chain.id === chainId ? { ...chain, tasks: chain.tasks.filter((task) => task.id !== taskId).map((task) => ({ ...task, dependsOn: task.dependsOn.filter((id) => id !== taskId) })) } : chain),
        }))
        get().addActivity(`Удалена задача «${title}»`, chainId)
      },
      reorderTasks: (chainId, from, to) => {
        set((state) => ({ ...snapshot(state, 'Изменение порядка задач'), chains: state.chains.map((chain) => chain.id === chainId ? { ...chain, tasks: reorder(chain.tasks, from, to) } : chain) }))
        get().addActivity('Изменён порядок шагов', chainId)
      },
      addSubtask: (chainId, taskId, title) => set((state) => ({ ...snapshot(state, 'Добавление подзадачи'), chains: state.chains.map((chain) => chain.id === chainId ? { ...chain, tasks: chain.tasks.map((task) => task.id === taskId ? { ...task, subtasks: [...task.subtasks, { id: uid(), title, completed: false }] } : task) } : chain) })),
      toggleSubtask: (chainId, taskId, subtaskId) => set((state) => ({ ...snapshot(state, 'Изменение подзадачи'), chains: state.chains.map((chain) => chain.id === chainId ? { ...chain, tasks: chain.tasks.map((task) => task.id === taskId ? { ...task, subtasks: task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask) } : task) } : chain) })),
      deleteSubtask: (chainId, taskId, subtaskId) => set((state) => ({ ...snapshot(state, 'Удаление подзадачи'), chains: state.chains.map((chain) => chain.id === chainId ? { ...chain, tasks: chain.tasks.map((task) => task.id === taskId ? { ...task, subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId) } : task) } : chain) })),
      setThemeMode: (themeMode) => set({ themeMode }),
      toggleThemeMode: () => set((state) => ({ themeMode: state.themeMode === 'light' ? 'dark' : 'light' })),
      setPalette: (palette) => set({ palette }),
      importChains: (chains) => set((state) => ({ ...snapshot(state, 'Импорт данных'), chains, selectedChainId: chains[0]?.id ?? null })),
      clearCompleted: (chainId) => set((state) => ({ ...snapshot(state, 'Очистка выполненных задач'), chains: state.chains.map((chain) => chain.id === chainId ? { ...chain, tasks: chain.tasks.filter((task) => !task.completed).map((task) => ({ ...task, dependsOn: task.dependsOn.filter((id) => chain.tasks.some((candidate) => candidate.id === id && !candidate.completed)) })) } : chain) })),
      undoLast: () => {
        const current = get().undoSnapshot
        if (!current) return null
        set({ chains: current.chains, selectedChainId: current.selectedChainId, undoSnapshot: null })
        return current.label
      },
      addActivity: (text, chainId) => set((state) => ({ activity: [{ id: uid(), text, createdAt: now(), chainId }, ...state.activity].slice(0, 30) })),
    }),
    {
      name: 'liniya-todo-v2',
      storage: safeStorage,
      version: 2,
      onRehydrateStorage: () => (state) => { state?.setHasHydrated(true) },
      migrate: (persisted) => {
        const state = persisted as Partial<AppState> & { theme?: string }
        const chains = (state.chains ?? []).map((chain) => ({
          ...chain,
          mode: chain.mode ?? 'free',
          tasks: (chain.tasks ?? []).map((task) => ({
            ...task,
            dependsOn: task.dependsOn ?? [],
            repeat: task.repeat ?? 'none',
            estimateMinutes: task.estimateMinutes ?? null,
          })),
        }))
        return {
          ...state,
          chains,
          selectedChainId: state.selectedChainId ?? null,
          themeMode: state.themeMode ?? (state.theme === 'dark' ? 'dark' : 'light'),
          palette: state.palette ?? 'violet',
          activity: state.activity ?? [],
        } as AppState
      },
      partialize: (state) => ({
        chains: state.chains,
        selectedChainId: state.selectedChainId,
        themeMode: state.themeMode,
        palette: state.palette,
        activity: state.activity,
      } as AppState),
    },
  ),
)

export const selectTaskTotals = (chains: Chain[]) => {
  const tasks = chains.filter((chain) => !chain.archived).flatMap((chain) => chain.tasks)
  return { total: tasks.length, completed: tasks.filter((task) => task.completed).length, active: tasks.filter((task) => !task.completed).length }
}

export function isTaskLocked(chain: Chain, task: Task): boolean {
  const index = chain.tasks.findIndex((item) => item.id === task.id)
  if (chain.mode === 'sequential') return chain.tasks.slice(0, index).some((item) => !item.completed)
  if (chain.mode === 'dependencies') return task.dependsOn.some((id) => !chain.tasks.find((item) => item.id === id)?.completed)
  return false
}

export const isPriority = (value: string): value is Priority => ['low', 'medium', 'high'].includes(value)
export const isSubtask = (value: unknown): value is Subtask => typeof value === 'object' && value !== null && 'id' in value && 'title' in value && 'completed' in value
