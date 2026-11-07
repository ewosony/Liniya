import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Archive, ArrowLeft, ArrowRight, BarChart3, Bell, CalendarDays, Check, CheckCheck, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Download, Focus, FolderKanban,
  GripVertical, LayoutDashboard, ListChecks, Moon, MoreHorizontal, Palette, Pencil, Plus, Search,
  Sparkles, Sun, Trash2, Upload, X, Zap, Play, Pause, RotateCcw, Repeat2,
  LockKeyhole, Undo2, WandSparkles, Keyboard, NotebookPen,
} from 'lucide-react'
import { useAppStore, selectTaskTotals, isTaskLocked } from './store'
import type { Chain, ChainMode, Palette as PaletteType, Priority, RepeatRule, Task, Template } from './types'

const chainColors = ['violet', 'blue', 'mint', 'amber', 'rose', 'slate'] as const
const colorNames: Record<string, string> = { violet: 'Фиолетовый', blue: 'Синий', mint: 'Мятный', amber: 'Янтарный', rose: 'Розовый', slate: 'Графитовый' }
const priorityNames: Record<Priority, string> = { high: 'Высокий', medium: 'Обычный', low: 'Низкий' }
const modeNames: Record<ChainMode, string> = { free: 'Свободный порядок', sequential: 'Последовательно', dependencies: 'Зависимости' }
const repeatNames: Record<RepeatRule, string> = { none: 'Не повторять', daily: 'Каждый день', weekly: 'Каждую неделю', monthly: 'Каждый месяц' }
const paletteNames: Record<PaletteType, string> = { violet: 'Лаванда', ocean: 'Океан', forest: 'Лес', rose: 'Розовая', amber: 'Янтарная' }
const paletteSwatches: Record<PaletteType, string> = { violet: '#8070dd', ocean: '#3f90b8', forest: '#4d9a79', rose: '#cb7898', amber: '#c18b43' }
const templates: Template[] = [
  { id: 'website', title: 'Создание сайта', description: 'От идеи до публикации', color: 'violet', mode: 'sequential', tasks: [{ title: 'Сформулировать идею и цель проекта', priority: 'high' }, { title: 'Собрать референсы и продумать структуру' }, { title: 'Создать дизайн интерфейса' }, { title: 'Настроить проект и зависимости' }, { title: 'Реализовать основные страницы' }, { title: 'Проверить адаптивность и ошибки' }, { title: 'Опубликовать сайт' }] },
  { id: 'exam', title: 'Подготовка к экзамену', description: 'Системная подготовка без аврала', color: 'blue', mode: 'sequential', tasks: [{ title: 'Собрать список тем и требований', priority: 'high' }, { title: 'Разделить темы на блоки' }, { title: 'Подготовить конспекты' }, { title: 'Повторить сложные темы' }, { title: 'Решить тренировочные задания' }, { title: 'Провести итоговое повторение' }] },
  { id: 'purchase', title: 'Покупка техники', description: 'Выбрать подходящее устройство', color: 'mint', mode: 'dependencies', tasks: [{ title: 'Определить бюджет и требования', priority: 'high' }, { title: 'Составить список подходящих моделей', dependsOnIndices: [0] }, { title: 'Сравнить характеристики и отзывы', dependsOnIndices: [1] }, { title: 'Проверить цены и гарантию', dependsOnIndices: [1] }, { title: 'Выбрать продавца', priority: 'high', dependsOnIndices: [2, 3] }, { title: 'Оформить покупку', dependsOnIndices: [4] }] },
  { id: 'trip', title: 'Планирование поездки', description: 'Подготовить всё к путешествию', color: 'amber', mode: 'free', tasks: [{ title: 'Выбрать направление и даты' }, { title: 'Проверить документы', priority: 'high' }, { title: 'Найти билеты' }, { title: 'Забронировать жильё' }, { title: 'Составить список мест' }, { title: 'Собрать вещи' }] },
  { id: 'personal', title: 'Личный проект', description: 'Универсальный план небольшого проекта', color: 'rose', mode: 'free', tasks: [{ title: 'Определить желаемый результат' }, { title: 'Разбить работу на этапы' }, { title: 'Подготовить необходимые материалы' }, { title: 'Выполнить первый этап' }, { title: 'Проверить результат' }] },
]

const toLocalISO = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const todayISO = () => toLocalISO(new Date())
const dateLabel = (value: string) => {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const today = todayISO()
  if (value === today) return 'Сегодня'
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  if (value === toLocalISO(tomorrow)) return 'Завтра'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
}
const isOverdue = (task: Task) => Boolean(task.dueDate && !task.completed && task.dueDate < todayISO())
const progressOf = (chain: Chain) => chain.tasks.length ? Math.round(chain.tasks.filter((task) => task.completed).length / chain.tasks.length * 100) : 0
const cn = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(' ')
const formatMinutes = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

function App() {
  const hasHydrated = useAppStore((state) => state.hasHydrated)
  const chains = useAppStore((state) => state.chains)
  const selectedChainId = useAppStore((state) => state.selectedChainId)
  const themeMode = useAppStore((state) => state.themeMode)
  const palette = useAppStore((state) => state.palette)
  const activity = useAppStore((state) => state.activity)
  const undoSnapshot = useAppStore((state) => state.undoSnapshot)
  const selectChain = useAppStore((state) => state.selectChain)
  const toggleThemeMode = useAppStore((state) => state.toggleThemeMode)
  const setPalette = useAppStore((state) => state.setPalette)
  const createChain = useAppStore((state) => state.createChain)
  const updateChain = useAppStore((state) => state.updateChain)
  const deleteChain = useAppStore((state) => state.deleteChain)
  const archiveChain = useAppStore((state) => state.archiveChain)
  const restoreChain = useAppStore((state) => state.restoreChain)
  const addTask = useAppStore((state) => state.addTask)
  const updateTask = useAppStore((state) => state.updateTask)
  const toggleTask = useAppStore((state) => state.toggleTask)
  const deleteTask = useAppStore((state) => state.deleteTask)
  const reorderTasks = useAppStore((state) => state.reorderTasks)
  const addSubtask = useAppStore((state) => state.addSubtask)
  const toggleSubtask = useAppStore((state) => state.toggleSubtask)
  const deleteSubtask = useAppStore((state) => state.deleteSubtask)
  const clearCompleted = useAppStore((state) => state.clearCompleted)
  const importChains = useAppStore((state) => state.importChains)
  const undoLast = useAppStore((state) => state.undoLast)

  const [page, setPage] = useState<'overview' | 'chain' | 'archive' | 'calendar' | 'focus' | 'templates' | 'settings'>('overview')
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')
  const [search, setSearch] = useState('')
  const [quickTask, setQuickTask] = useState('')
  const [modal, setModal] = useState<'chain' | 'task' | null>(null)
  const [editChainId, setEditChainId] = useState<string | null>(null)
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [showChainMenu, setShowChainMenu] = useState(false)
  const [toast, setToast] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [calendarView, setCalendarView] = useState<'month' | 'timeline'>('month')
  const [focusTask, setFocusTask] = useState<{ chainId: string; taskId: string } | null>(null)
  const [focusSeconds, setFocusSeconds] = useState(25 * 60)
  const [focusRunning, setFocusRunning] = useState(false)
  const [focusDuration, setFocusDuration] = useState(25)
  const importInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const activeChains = useMemo(() => chains.filter((chain) => !chain.archived), [chains])
  const archivedChains = useMemo(() => chains.filter((chain) => chain.archived), [chains])
  const visibleArchivedChains = useMemo(() => archivedChains.filter((chain) => chainMatches(chain, search)), [archivedChains, search])
  const currentChain = chains.find((chain) => chain.id === selectedChainId && !chain.archived) ?? null
  const totals = selectTaskTotals(chains)
  const allActiveTasks = activeChains.flatMap((chain) => chain.tasks.map((task) => ({ ...task, chainId: chain.id, chainTitle: chain.title, chainColor: chain.color })))
  const overdueTasks = allActiveTasks.filter((task) => isOverdue(task))
  const dueToday = allActiveTasks.filter((task) => task.dueDate === todayISO() && !task.completed).length
  const upcomingTasks = allActiveTasks.filter((task) => task.dueDate && !task.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8)
  const currentTask = currentChain?.tasks.find((task) => task.id === editTaskId) ?? null
  const editingChain = chains.find((chain) => chain.id === editChainId) ?? null
  const totalSubtasks = allActiveTasks.reduce((sum, task) => sum + task.subtasks.length, 0)

  useEffect(() => {
    document.documentElement.dataset.mode = themeMode
    document.documentElement.dataset.palette = palette
    document.documentElement.style.colorScheme = themeMode
  }, [themeMode, palette])

  useEffect(() => {
    if (!hasHydrated || !window.liniyaDesktop) return
    const reminders = chains
      .filter((chain) => !chain.archived)
      .flatMap((chain) => chain.tasks
        .filter((task) => !task.completed && task.reminderAt)
        .map((task) => ({ id: task.id, title: task.title, chainTitle: chain.title, reminderAt: task.reminderAt as string })))
    window.liniyaDesktop.syncReminders(reminders)
  }, [hasHydrated, chains])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!focusRunning) return
    const timer = window.setInterval(() => setFocusSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [focusRunning])

  useEffect(() => {
    if (focusRunning && focusSeconds === 0) {
      setFocusRunning(false)
      setToast('Сессия фокуса завершена')
    }
  }, [focusRunning, focusSeconds])

  const openChain = (id: string) => { selectChain(id); setPage('chain'); setFilter('all'); setSearch('') }
  const showOverview = () => { selectChain(null); setPage('overview'); setSearch('') }
  const showArchive = () => { selectChain(null); setPage('archive') }
  const showCalendar = () => { selectChain(null); setPage('calendar') }
  const startCreateChain = () => { setEditChainId(null); setModal('chain') }
  const startEditChain = () => { if (!currentChain) return; setEditChainId(currentChain.id); setShowChainMenu(false); setModal('chain') }
  const startEditTask = (taskId: string) => { setEditTaskId(taskId); setModal('task') }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus() }
      if (event.key.toLowerCase() === 'n' && page !== 'focus') { event.preventDefault(); startCreateChain() }
      if (event.key === '1') { event.preventDefault(); showOverview() }
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); setPage('focus') }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [page])

  const onQuickAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = quickTask.trim()
    if (!title || !currentChain) return
    addTask(currentChain.id, title)
    setQuickTask('')
    setToast('Шаг добавлен в цепочку')
  }

  const onDragEnd = (event: DragEndEvent) => {
    if (!currentChain || !event.over || event.active.id === event.over.id || filter !== 'all' || search.trim()) return
    const from = currentChain.tasks.findIndex((task) => task.id === event.active.id)
    const to = currentChain.tasks.findIndex((task) => task.id === event.over?.id)
    if (from !== -1 && to !== -1) reorderTasks(currentChain.id, from, to)
  }

  const exportData = () => {
    const payload = { app: 'Линия', version: 2, exportedAt: new Date().toISOString(), chains, themeMode, palette }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `liniya-backup-${todayISO()}.json`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setToast('Резервная копия создана')
  }

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const backup = parsed && typeof parsed === 'object' ? parsed as { chains?: unknown; themeMode?: unknown; palette?: unknown } : null
      const possibleChains = Array.isArray(parsed) ? parsed : backup?.chains
      if (!Array.isArray(possibleChains) || possibleChains.length > 500 || !possibleChains.every(isValidChain)) throw new Error('Invalid backup')
      if (chains.length && !window.confirm(`Импорт заменит текущие данные (${chains.length} цепочек). Продолжить? Рекомендуется сначала сделать экспорт.`)) return
      const normalizedChains = (possibleChains as Chain[]).map((chain) => {
        const seen = new Set<string>()
        const tasks = chain.tasks.map((task) => {
          const safeDependencies = (task.dependsOn ?? []).filter((id) => seen.has(id))
          seen.add(task.id)
          return { ...task, reminderAt: task.reminderAt ?? '', dependsOn: safeDependencies, repeat: task.repeat ?? 'none', estimateMinutes: task.estimateMinutes ?? null }
        })
        return { ...chain, mode: chain.mode ?? 'free', tasks }
      })
      importChains(normalizedChains)
      if (backup?.themeMode === 'light' || backup?.themeMode === 'dark') useAppStore.getState().setThemeMode(backup.themeMode)
      if (backup?.palette && ['violet', 'ocean', 'forest', 'rose', 'amber'].includes(backup.palette as string)) useAppStore.getState().setPalette(backup.palette as PaletteType)
      setSearch(''); setPage('overview'); setToast(`Импортировано цепочек: ${normalizedChains.length}`)
    } catch { setToast('Не удалось прочитать резервную копию. Проверь файл.') }
    finally { event.target.value = '' }
  }

  const handleDeleteChain = () => {
    if (!currentChain) return
    if (window.confirm(`Удалить цепочку «${currentChain.title}» вместе со всеми задачами?`)) {
      deleteChain(currentChain.id); setPage('overview'); setToast('Цепочка удалена')
    }
    setShowChainMenu(false)
  }
  const handleArchiveChain = () => {
    if (!currentChain) return
    archiveChain(currentChain.id); setPage('overview'); setToast('Цепочка перемещена в архив'); setShowChainMenu(false)
  }
  const handleSaveChain = (input: { title: string; description: string; color: string; mode: ChainMode }) => {
    if (editChainId) { updateChain(editChainId, input); setToast('Изменения сохранены') }
    else { createChain(input); setPage('chain'); setToast('Новая цепочка создана') }
    setModal(null)
  }
  const handleSaveTask = (input: { title: string; description: string; priority: Priority; dueDate: string; reminderAt: string; dependsOn: string[]; repeat: RepeatRule; estimateMinutes: number | null }) => {
    if (!currentChain || !editTaskId) return
    updateTask(currentChain.id, editTaskId, input); setModal(null); setToast('Задача обновлена')
  }
  const handleRestoreChain = (id: string) => { restoreChain(id); setPage('chain'); setToast('Цепочка восстановлена') }
  const handleApplyTemplate = (template: Template) => {
    const id = createChain({ title: template.title, description: template.description, color: template.color, mode: template.mode }, template.tasks)
    setPage('chain'); selectChain(id); setToast(`Шаблон «${template.title}» добавлен`)
  }
  const handleUndo = () => { const label = undoLast(); if (label) { if (page === 'chain' && !useAppStore.getState().selectedChainId) setPage('overview'); setToast(`Отменено: ${label}`) } }

  const beginFocus = (taskRef?: { chainId: string; taskId: string }) => {
    const candidate = taskRef ?? getNextFocusTask(activeChains)
    if (!candidate) { setToast('Нет доступных задач для фокуса'); return }
    setFocusTask(candidate); setFocusSeconds(focusDuration * 60); setFocusRunning(false); setPage('focus')
  }
  const focusCurrent = (focusTask ? chains.find((chain) => chain.id === focusTask.chainId)?.tasks.find((task) => task.id === focusTask.taskId) : null) ?? null
  const focusChain = focusTask ? chains.find((chain) => chain.id === focusTask.chainId) : null
  const completeFocusTask = () => {
    if (!focusTask) return
    toggleTask(focusTask.chainId, focusTask.taskId)
    const latestChains = useAppStore.getState().chains.filter((chain) => !chain.archived)
    const next = getNextFocusTask(latestChains, focusTask)
    setFocusRunning(false)
    if (next) { setFocusTask(next); setFocusSeconds(focusDuration * 60); setToast('Задача завершена. Следующий шаг готов.') }
    else { setFocusTask(null); setPage('overview'); setToast('Все доступные задачи выполнены') }
  }

  if (!hasHydrated) return <div className="boot-screen"><div className="brand-mark"><span /><span /><span /></div><strong>линия.</strong><span>Загружаем твои цепочки…</span></div>

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" onClick={showOverview} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && showOverview()}>
          <div className="brand-mark"><span /><span /><span /></div>
          <div><div className="brand-name">линия<span>.</span></div><div className="brand-caption">пространство задач</div></div>
        </div>
        <div className="sidebar-section-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav className="main-nav">
          <NavButton active={page === 'overview'} onClick={showOverview} icon={<LayoutDashboard size={18} />} label="Обзор" shortcut="1" />
          <NavButton active={page === 'calendar'} onClick={showCalendar} icon={<CalendarDays size={18} />} label="Календарь" />
          <NavButton active={page === 'templates'} onClick={() => setPage('templates')} icon={<WandSparkles size={18} />} label="Шаблоны" />
          <NavButton active={page === 'focus'} onClick={() => beginFocus()} icon={<Focus size={18} />} label="Фокус" shortcut="⌘ J" />
          <NavButton active={page === 'archive'} onClick={showArchive} icon={<Archive size={18} />} label="Архив" count={archivedChains.length} />
        </nav>
        <div className="chain-list-heading"><div className="sidebar-section-label">МОИ ЦЕПОЧКИ <span>{activeChains.length}</span></div><button className="icon-button small" onClick={startCreateChain} title="Создать цепочку"><Plus size={16} /></button></div>
        <div className="sidebar-chains">
          {activeChains.map((chain) => <button key={chain.id} className={cn('chain-nav-item', page === 'chain' && currentChain?.id === chain.id && 'active')} onClick={() => openChain(chain.id)}>
            <span className={`chain-dot ${chain.color}`} /><span className="chain-nav-name">{chain.title}</span><span className="chain-nav-progress">{chain.tasks.filter((task) => task.completed).length}/{chain.tasks.length}</span>
          </button>)}
          {!activeChains.length && <div className="sidebar-empty">Здесь появятся твои цепочки</div>}
        </div>
        <div className="sidebar-spacer" />
        <div className="sidebar-note"><div className="note-icon"><Sparkles size={16} /></div><div><strong>По одному шагу</strong><p>Большие планы становятся проще, когда виден следующий шаг.</p></div></div>
        <div className="sidebar-bottom">
          <div className="local-status"><span className="status-dot" /><span>Сохранение на этом устройстве</span></div>
          <div className="sidebar-actions">
            <button className="sidebar-action" onClick={exportData} title="Экспорт" aria-label="Экспорт"><Download size={16} /><span>Экспорт</span></button>
            <button className="sidebar-action" onClick={() => importInput.current?.click()} title="Импорт" aria-label="Импорт"><Upload size={16} /><span>Импорт</span></button>
          </div>
        </div>
        <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>ЛИНИЯ</span><ChevronRight size={14} /><strong>{pageTitle(page, currentChain?.title)}</strong></div>
          <div className="topbar-actions">
            <div className="search-box"><Search size={16} /><input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти цепочку или задачу…" aria-label="Поиск" /><kbd>Ctrl K</kbd>{search && <button className="search-clear" onClick={() => setSearch('')} aria-label="Очистить"><X size={13} /></button>}</div>
            <button className="top-icon" onClick={toggleThemeMode} title={themeMode === 'light' ? 'Тёмная тема' : 'Светлая тема'} aria-label="Переключить тему">{themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
            <button className="avatar" onClick={() => setPage('settings')} title="Настройки оформления">Л</button>
          </div>
        </header>

        <div className="page-content">
          {page === 'overview' && <OverviewPage chains={activeChains} totals={totals} dueToday={dueToday} overdueTasks={overdueTasks} upcomingTasks={upcomingTasks} activity={activity} search={search} onOpenChain={openChain} onCreateChain={startCreateChain} onOpenTask={(chainId, taskId) => { openChain(chainId); setEditTaskId(taskId); setModal('task') }} onStartFocus={() => beginFocus()} />}

          {page === 'chain' && currentChain && <section className="chain-page">
            <div className="chain-heading-row">
              <div className="chain-heading-left"><div className={`chain-large-icon ${currentChain.color}`}><FolderKanban size={22} /></div><div className="chain-heading-copy"><div className="eyebrow">ЦЕПОЧКА ЗАДАЧ</div><h1>{currentChain.title}</h1><p>{currentChain.description || 'Добавь описание, чтобы помнить, к чему ведёт эта цепочка.'}</p></div></div>
              <div className="chain-heading-actions"><button className="button secondary" onClick={startEditChain}><Pencil size={15} />Изменить</button><div className="menu-wrap"><button className="icon-button" onClick={() => setShowChainMenu(!showChainMenu)} aria-label="Действия с цепочкой"><MoreHorizontal size={19} /></button>{showChainMenu && <div className="dropdown-menu"><button onClick={startEditChain}><Pencil size={15} />Настройки цепочки</button><button onClick={handleArchiveChain}><Archive size={15} />В архив</button><div className="dropdown-divider" /><button className="danger-text" onClick={handleDeleteChain}><Trash2 size={15} />Удалить цепочку</button></div>}</div></div>
            </div>
            <div className="chain-mode-row"><div><span className="eyebrow">РЕЖИМ ВЫПОЛНЕНИЯ</span><strong>{modeNames[currentChain.mode]}</strong><small>{modeDescription(currentChain.mode)}</small></div><select value={currentChain.mode} onChange={(event) => updateChain(currentChain.id, { mode: event.target.value as ChainMode })} aria-label="Режим выполнения цепочки"><option value="free">Свободный порядок</option><option value="sequential">Последовательно</option><option value="dependencies">Зависимости и ветвления</option></select></div>
            <div className="chain-progress-panel"><div className="progress-panel-top"><div><span className="progress-title">Общий прогресс</span><span className="progress-caption">Продвигайся в своём темпе</span></div><div className="progress-numbers"><strong>{progressOf(currentChain)}%</strong><span>{currentChain.tasks.filter((task) => task.completed).length} из {currentChain.tasks.length} шагов</span></div></div><div className="progress-track"><div className={`progress-fill ${currentChain.color}`} style={{ width: `${progressOf(currentChain)}%` }} /></div><div className="progress-panel-bottom"><span><span className="tiny-dot done-dot" />Выполнено: {currentChain.tasks.filter((task) => task.completed).length}</span><span><span className="tiny-dot todo-dot" />Осталось: {currentChain.tasks.filter((task) => !task.completed).length}</span><span className="progress-hint">{progressOf(currentChain) === 100 && currentChain.tasks.length > 0 ? 'Цепочка завершена — отличная работа!' : 'Перетаскивай шаги, чтобы менять порядок'}</span></div></div>
            <div className="tasks-section-header"><div><h2>Шаги цепочки</h2><p>Подзадачи, сроки и зависимости — всё в одном месте</p></div><div className="task-tools"><div className="filter-tabs"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>Все <span>{currentChain.tasks.length}</span></button><button className={filter === 'active' ? 'selected' : ''} onClick={() => setFilter('active')}>В работе</button><button className={filter === 'done' ? 'selected' : ''} onClick={() => setFilter('done')}>Готово</button></div><button className="button primary" onClick={() => document.getElementById('quick-task-input')?.focus()}><Plus size={16} />Добавить шаг</button></div></div>
            <form className="quick-add" onSubmit={onQuickAdd}><div className="quick-add-plus"><Plus size={17} /></div><input id="quick-task-input" value={quickTask} onChange={(event) => setQuickTask(event.target.value)} placeholder="Какой следующий шаг?" aria-label="Название нового шага" /><span className="quick-add-hint">Enter ↵</span><button type="submit" disabled={!quickTask.trim()} className="quick-add-submit">Добавить</button></form>
            <TaskList chain={currentChain} filter={filter} search={search} onDragEnd={onDragEnd} onEdit={startEditTask} onToggle={(taskId) => { const task = currentChain.tasks.find((item) => item.id === taskId); if (task && !task.completed && isTaskLocked(currentChain, task)) { setToast('Сначала заверши предыдущие шаги или задачи-зависимости'); return } if (toggleTask(currentChain.id, taskId)) setToast(task?.completed ? 'Задача возвращена в работу' : 'Задача выполнена') }} onDelete={(taskId) => { if (window.confirm('Удалить этот шаг?')) { deleteTask(currentChain.id, taskId); setToast('Шаг удалён') } }} onAddSubtask={(taskId, title) => addSubtask(currentChain.id, taskId, title)} onToggleSubtask={(taskId, subtaskId) => toggleSubtask(currentChain.id, taskId, subtaskId)} onDeleteSubtask={(taskId, subtaskId) => deleteSubtask(currentChain.id, taskId, subtaskId)} />
            {currentChain.tasks.some((task) => task.completed) && <div className="clear-completed-wrap"><button className="text-button" onClick={() => { if (window.confirm('Убрать все выполненные шаги из этой цепочки?')) { clearCompleted(currentChain.id); setToast('Выполненные шаги убраны') } }}><CheckCheck size={15} />Убрать выполненные шаги</button></div>}
            <button className="chain-focus-cta" onClick={() => beginFocus()}><Focus size={17} /><span><strong>Перейти в режим концентрации</strong><small>Сфокусироваться на следующей доступной задаче</small></span><ArrowRight size={17} /></button>
          </section>}

          {page === 'chain' && !currentChain && <EmptyState icon={<FolderKanban size={24} />} title="Цепочка не найдена" text="Она могла быть удалена или перемещена в архив." action="Вернуться к обзору" onAction={showOverview} />}
          {page === 'archive' && <ArchivePage chains={visibleArchivedChains} hasSearch={Boolean(search)} onRestore={handleRestoreChain} onDelete={(id) => { if (window.confirm('Удалить цепочку навсегда?')) deleteChain(id) }} onClearSearch={() => setSearch('')} onOverview={showOverview} />}
          {page === 'calendar' && <CalendarPage chains={activeChains} month={calendarMonth} setMonth={setCalendarMonth} view={calendarView} setView={setCalendarView} onOpenTask={(chainId, taskId) => { openChain(chainId); setEditTaskId(taskId); setModal('task') }} />}
          {page === 'templates' && <TemplatesPage templates={templates} onApply={handleApplyTemplate} onCreate={startCreateChain} />}
          {page === 'settings' && <SettingsPage palette={palette} setPalette={setPalette} onExport={exportData} onImport={() => importInput.current?.click()} onUndo={handleUndo} hasUndo={Boolean(undoSnapshot)} totalChains={chains.length} totalTasks={totals.total} totalSubtasks={totalSubtasks} />}
          {page === 'focus' && <FocusPage task={focusCurrent} chain={focusChain ?? null} seconds={focusSeconds} duration={focusDuration} setDuration={(minutes) => { setFocusDuration(minutes); setFocusSeconds(minutes * 60); setFocusRunning(false) }} running={focusRunning} setRunning={setFocusRunning} onBack={showOverview} onComplete={completeFocusTask} onSelectNext={() => { const next = getNextFocusTask(useAppStore.getState().chains.filter((chain) => !chain.archived), focusTask ?? undefined); if (next) { setFocusTask(next); setFocusSeconds(focusDuration * 60); setFocusRunning(false) } else setToast('Других доступных задач пока нет') }} />}
        </div>
        <footer className="app-footer"><span>ЛИНИЯ · ЛИЧНОЕ ПРОСТРАНСТВО</span><span>Маленькие шаги складываются в большие результаты.</span></footer>
      </main>

      {modal === 'chain' && <ChainModal initial={editingChain} onClose={() => setModal(null)} onSave={handleSaveChain} />}
      {modal === 'task' && currentTask && currentChain && <TaskModal task={currentTask} chain={currentChain} onClose={() => setModal(null)} onSave={handleSaveTask} />}
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}{undoSnapshot && <button onClick={handleUndo} className="toast-undo"><Undo2 size={14} />Отменить</button>}</div>}
    </div>
  )
}

function NavButton({ active, onClick, icon, label, shortcut, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; shortcut?: string; count?: number }) {
  return <button className={cn('nav-item', active && 'active')} onClick={onClick}>{icon}<span>{label}</span>{shortcut && <span className="nav-shortcut">{shortcut}</span>}{Boolean(count) && <span className="nav-count">{count}</span>}</button>
}

function OverviewPage({ chains, totals, dueToday, overdueTasks, upcomingTasks, activity, search, onOpenChain, onCreateChain, onOpenTask, onStartFocus }: {
  chains: Chain[]; totals: ReturnType<typeof selectTaskTotals>; dueToday: number; overdueTasks: Array<Task & { chainId: string; chainTitle: string; chainColor: string }>; upcomingTasks: Array<Task & { chainId: string; chainTitle: string; chainColor: string }>; activity: Array<{ id: string; text: string; createdAt: string; chainId?: string }>; search: string; onOpenChain: (id: string) => void; onCreateChain: () => void; onOpenTask: (chainId: string, taskId: string) => void; onStartFocus: () => void
}) {
  const greeting = new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер'
  const visibleChains = chains.filter((chain) => chainMatches(chain, search))
  const chainCount = chains.length
  const overallProgress = totals.total ? Math.round(totals.completed / totals.total * 100) : 0
  return <section className="overview-page">
    <div className="overview-welcome"><div className="welcome-copy"><div className="eyebrow">ТВОЙ РИТМ · {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</div><h1>{greeting}. <span>Давай двигаться дальше.</span></h1><p>Собери дела в цепочки и проходи их шаг за шагом. Не нужно держать всё в голове.</p><div className="welcome-actions"><button className="button primary" onClick={onCreateChain}><Plus size={16} />Новая цепочка</button><button className="button glass" onClick={onStartFocus}><Focus size={16} />Начать фокус</button></div></div><div className="welcome-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><Zap size={27} fill="currentColor" /></div><span className="orbit-star star-a">✦</span><span className="orbit-star star-b">✧</span><span className="orbit-star star-c">·</span></div></div>
    <div className="metric-grid"><MetricCard icon={<ListChecks size={18} />} label="Всего шагов" value={totals.total} detail={`${totals.active} ещё впереди`} tone="purple" /><MetricCard icon={<CheckCircle2 size={18} />} label="Выполнено" value={totals.completed} detail={`${overallProgress}% общего прогресса`} tone="green" /><MetricCard icon={<CalendarDays size={18} />} label="На сегодня" value={dueToday} detail={dueToday ? 'Есть задачи со сроком сегодня' : 'На сегодня всё свободно'} tone="blue" /><MetricCard icon={<Clock3 size={18} />} label="Просрочено" value={overdueTasks.length} detail={overdueTasks.length ? 'Стоит пересмотреть сроки' : 'Всё под контролем'} tone="orange" /></div>
    <div className="overview-main-grid"><div className="overview-primary-column">
      <div className="section-heading-row"><div><h2>Твои цепочки</h2><p>{chainCount === 0 ? 'Создай первую последовательность задач' : `${chainCount} ${chainWord(chainCount)} · каждый план на своём месте`}</p></div><button className="button primary" onClick={onCreateChain}><Plus size={16} />Новая цепочка</button></div>
      {visibleChains.length ? <div className="chain-card-grid">{visibleChains.map((chain) => <ChainCard key={chain.id} chain={chain} onClick={() => onOpenChain(chain.id)} />)}</div> : <div className="empty-card"><div className="empty-illustration"><FolderKanban size={27} /></div><h3>{search ? 'Ничего не найдено' : 'Начни с первой цепочки'}</h3><p>{search ? 'Попробуй изменить поисковый запрос.' : 'Можно создать цепочку с нуля или взять готовый шаблон.'}</p>{!search && <button className="button primary" onClick={onCreateChain}><Plus size={16} />Создать цепочку</button>}</div>}
      {overdueTasks.length > 0 && <div className="attention-panel"><div className="attention-icon"><Bell size={17} /></div><div className="attention-copy"><strong>Есть задачи, которым нужно внимание</strong><span>{overdueTasks.length} {taskWord(overdueTasks.length)} вышли за срок. Проверь, актуальны ли даты.</span></div><span className="attention-count">{overdueTasks.length}</span></div>}
      <div className="side-panel activity-panel"><div className="side-panel-heading"><div><span className="eyebrow">ПОСЛЕДНИЕ ДЕЙСТВИЯ</span><h3>История</h3></div><div className="calendar-badge"><Clock3 size={17} /></div></div>{activity.length ? <div className="activity-list">{activity.slice(0, 5).map((item) => <div className="activity-item" key={item.id}><span className="activity-dot" /><div><strong>{item.text}</strong><small>{new Date(item.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></div>)}</div> : <div className="activity-empty">Здесь появится история твоих действий.</div>}</div>
    </div><aside className="overview-side-column">
      <div className="side-panel today-panel"><div className="side-panel-heading"><div><span className="eyebrow">БЛИЖАЙШИЕ СРОКИ</span><h3>На горизонте</h3></div><div className="calendar-badge"><CalendarDays size={17} /></div></div>{upcomingTasks.length ? <div className="deadline-list">{upcomingTasks.slice(0, 6).map((task) => <button className="deadline-item" key={`${task.chainId}-${task.id}`} onClick={() => onOpenTask(task.chainId, task.id)}><span className={`deadline-line ${task.chainColor}`} /><span className="deadline-main"><strong>{task.title}</strong><small>{task.chainTitle}</small></span><span className={cn('deadline-date', isOverdue(task) && 'overdue')}>{dateLabel(task.dueDate)}</span></button>)}</div> : <div className="side-empty"><div className="side-empty-icon"><CalendarDays size={20} /></div><strong>Пока нет ближайших сроков</strong><span>Добавь дату к задаче, чтобы увидеть её здесь.</span></div>}</div>
      <div className="side-panel focus-panel"><div className="focus-top"><div className="focus-icon"><BarChart3 size={17} /></div><span className="eyebrow">ТВОЯ ДИНАМИКА</span></div><div className="focus-number">{overallProgress}<span>%</span></div><p>общего прогресса по активным цепочкам</p><div className="mini-progress-track"><div style={{ width: `${overallProgress}%` }} /></div><div className="focus-foot"><span>{totals.completed} сделано</span><span>{totals.active} осталось</span></div></div>
      <div className="quote-card"><span className="quote-mark">“</span><p>Не обязательно видеть всю лестницу. Достаточно сделать следующий шаг.</p><span className="quote-caption">ПРИНЦИП МАЛЕНЬКИХ ШАГОВ</span></div>
    </aside></div>
  </section>
}

function MetricCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: number; detail: string; tone: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></div> }
function ChainCard({ chain, onClick }: { chain: Chain; onClick: () => void }) {
  const done = chain.tasks.filter((task) => task.completed).length
  const progress = progressOf(chain)
  const nextTask = chain.tasks.find((task) => !task.completed && !isTaskLocked(chain, task))
  return <button className="chain-card" onClick={onClick}><div className="chain-card-top"><div className={`chain-card-symbol ${chain.color}`}><FolderKanban size={18} /></div><span className="mode-chip">{chain.mode === 'free' ? 'Свободно' : chain.mode === 'sequential' ? 'По порядку' : 'Зависимости'}</span><span className="chain-card-arrow"><ArrowRight size={17} /></span></div><h3>{chain.title}</h3><p>{chain.description || 'Без описания'}</p><div className="chain-card-progress-label"><span>Прогресс</span><strong>{progress}%</strong></div><div className="chain-card-progress"><span className={chain.color} style={{ width: `${progress}%` }} /></div><div className="chain-card-footer"><span>{done} из {chain.tasks.length} шагов</span><span>{nextTask ? `Далее: ${truncate(nextTask.title, 24)}` : chain.tasks.length ? 'Всё выполнено' : 'Пока нет шагов'}</span></div></button>
}

function TaskList({ chain, filter, search, onDragEnd, onEdit, onToggle, onDelete, onAddSubtask, onToggleSubtask, onDeleteSubtask }: {
  chain: Chain; filter: 'all' | 'active' | 'done'; search: string; onDragEnd: (event: DragEndEvent) => void; onEdit: (id: string) => void; onToggle: (id: string) => void; onDelete: (id: string) => void; onAddSubtask: (taskId: string, title: string) => void; onToggleSubtask: (taskId: string, subtaskId: string) => void; onDeleteSubtask: (taskId: string, subtaskId: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const tasks = chain.tasks.filter((task) => {
    const matchesFilter = filter === 'all' || (filter === 'active' ? !task.completed : task.completed)
    const searchable = `${task.title} ${task.description} ${task.subtasks.map((subtask) => subtask.title).join(' ')}`.toLowerCase()
    return matchesFilter && searchable.includes(search.toLowerCase())
  })
  if (!tasks.length) return <div className="task-empty"><div className="task-empty-icon">{filter === 'done' ? <CheckCheck size={22} /> : <ListChecks size={22} />}</div><strong>{search ? 'Задачи не найдены' : filter === 'done' ? 'Пока ничего не выполнено' : filter === 'active' ? 'Все шаги выполнены' : 'Цепочка пока пустая'}</strong><span>{search ? 'Попробуй другой запрос.' : filter === 'done' ? 'Отмечай шаги галочкой, когда закончишь.' : filter === 'active' ? 'Отличная работа — можно выдохнуть.' : 'Добавь первый шаг в поле выше.'}</span></div>
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}><div className="task-list">{tasks.map((task, index) => <SortableTask key={task.id} task={task} chain={chain} index={index} dragEnabled={filter === 'all' && !search.trim()} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onAddSubtask={onAddSubtask} onToggleSubtask={onToggleSubtask} onDeleteSubtask={onDeleteSubtask} />)}</div></SortableContext></DndContext>
}

function SortableTask({ task, chain, index, dragEnabled, onEdit, onToggle, onDelete, onAddSubtask, onToggleSubtask, onDeleteSubtask }: {
  task: Task; chain: Chain; index: number; dragEnabled: boolean; onEdit: (id: string) => void; onToggle: (id: string) => void; onDelete: (id: string) => void; onAddSubtask: (taskId: string, title: string) => void; onToggleSubtask: (taskId: string, subtaskId: string) => void; onDeleteSubtask: (taskId: string, subtaskId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !dragEnabled })
  const [expanded, setExpanded] = useState(false)
  const [subtaskInput, setSubtaskInput] = useState('')
  const completedSubs = task.subtasks.filter((subtask) => subtask.completed).length
  const dueOver = isOverdue(task)
  const locked = !task.completed && isTaskLocked(chain, task)
  const lockLabels = task.dependsOn.map((id) => chain.tasks.find((item) => item.id === id)?.title).filter(Boolean)
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.48 : 1, zIndex: isDragging ? 2 : 1 }
  const submitSubtask = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!subtaskInput.trim()) return; onAddSubtask(task.id, subtaskInput.trim()); setSubtaskInput(''); setExpanded(true) }
  return <article ref={setNodeRef} style={style} className={cn('task-card', task.completed && 'task-completed', expanded && 'expanded', locked && 'task-locked')}>
    <div className="task-main-row">
      <button className="drag-handle" {...attributes} {...(listeners ?? {})} title={dragEnabled ? 'Перетащить шаг' : 'Изменение порядка доступно в фильтре «Все»'} aria-label="Изменить порядок"><GripVertical size={17} /></button>
      <button className={cn('task-check', task.completed && 'checked', locked && 'locked')} onClick={() => !locked && onToggle(task.id)} title={locked ? 'Сначала выполни зависимости' : task.completed ? 'Вернуть в работу' : 'Отметить выполненным'} aria-label="Статус задачи">{locked ? <LockKeyhole size={12} /> : task.completed && <Check size={14} />}</button>
      <button className="task-title-area" onClick={() => setExpanded(!expanded)}><span className="task-title">{task.title}</span>{task.description && <span className="task-description-preview">{truncate(task.description, 100)}</span>}</button>
      <div className="task-meta">{task.subtasks.length > 0 && <span className={cn('subtask-count', completedSubs === task.subtasks.length && 'all-subs-done')}><ListChecks size={13} />{completedSubs}/{task.subtasks.length}</span>}<span className={`priority-label ${task.priority}`}><span />{priorityNames[task.priority]}</span>{task.repeat !== 'none' && <span className="repeat-label" title={repeatNames[task.repeat]}><Repeat2 size={13} /></span>}{task.dueDate && <span className={cn('due-label', dueOver && 'overdue')}><CalendarDays size={13} />{dateLabel(task.dueDate)}</span>}{task.reminderAt && <span className="reminder-label" title={`Напоминание: ${new Date(task.reminderAt).toLocaleString('ru-RU')}`}><Bell size={13} />{new Date(task.reminderAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>}</div>
      <div className="task-actions"><button className="icon-button small" onClick={() => onEdit(task.id)} title="Редактировать"><Pencil size={15} /></button><button className="icon-button small danger-hover" onClick={() => onDelete(task.id)} title="Удалить"><Trash2 size={15} /></button><button className="icon-button small expand-button" onClick={() => setExpanded(!expanded)} title={expanded ? 'Свернуть' : 'Подробности'}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></div>
    </div>
    {locked && <div className="locked-note"><LockKeyhole size={13} />{chain.mode === 'sequential' ? 'Откроется после завершения предыдущих шагов' : `Ожидает: ${lockLabels.join(', ') || 'зависимые задачи'}`}</div>}
    {expanded && <div className="task-expanded-content">{task.description && <p className="task-full-description">{task.description}</p>}{task.estimateMinutes && <div className="task-estimate"><Clock3 size={13} />Оценка: {task.estimateMinutes} мин.</div>}<div className="subtasks-heading"><span>Подзадачи <span className="subtasks-total">{completedSubs}/{task.subtasks.length}</span></span><span className="subtasks-line" /></div>{task.subtasks.map((subtask) => <div className="subtask-row" key={subtask.id}><button className={cn('subtask-check', subtask.completed && 'checked')} onClick={() => onToggleSubtask(task.id, subtask.id)}>{subtask.completed && <Check size={11} />}</button><span className={subtask.completed ? 'subtask-done' : ''}>{subtask.title}</span><button className="subtask-delete" onClick={() => onDeleteSubtask(task.id, subtask.id)} title="Удалить подзадачу"><X size={13} /></button></div>)}<form className="subtask-add" onSubmit={submitSubtask}><Plus size={14} /><input value={subtaskInput} onChange={(event) => setSubtaskInput(event.target.value)} placeholder="Добавить подзадачу…" /><button type="submit" disabled={!subtaskInput.trim()}>Добавить</button></form></div>}
    <span className="task-index">{String(index + 1).padStart(2, '0')}</span>
  </article>
}

function ChainModal({ initial, onClose, onSave }: { initial: Chain | null; onClose: () => void; onSave: (value: { title: string; description: string; color: string; mode: ChainMode }) => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? 'violet')
  const [mode, setMode] = useState<ChainMode>(initial?.mode ?? 'free')
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (title.trim()) onSave({ title: title.trim(), description: description.trim(), color, mode }) }
  return <ModalFrame onClose={onClose}><form className="modal-card" onSubmit={submit}><div className="modal-header"><div><div className="eyebrow">{initial ? 'НАСТРОЙКИ' : 'НОВОЕ ПРОСТРАНСТВО'}</div><h2>{initial ? 'Изменить цепочку' : 'Создать цепочку'}</h2><p>{initial ? 'Обнови параметры своего плана.' : 'Собери связанные задачи в один понятный маршрут.'}</p></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
    <label className="field-label">Название цепочки<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, подготовка к экзамену" maxLength={60} required /></label><label className="field-label">Короткое описание <span className="optional-label">необязательно</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="К какому результату ведёт эта цепочка?" rows={3} maxLength={180} /></label>
    <label className="field-label">Порядок выполнения<select value={mode} onChange={(event) => setMode(event.target.value as ChainMode)}><option value="free">Свободный — все задачи доступны</option><option value="sequential">Последовательный — шаг за шагом</option><option value="dependencies">Зависимости — параллельные ветки</option></select><span className="field-hint">Режим можно изменить в любой момент.</span></label>
    <div className="field-label">Цвет цепочки<div className="color-picker">{chainColors.map((item) => <button type="button" key={item} className={cn('color-choice', item, color === item && 'chosen')} onClick={() => setColor(item)} title={colorNames[item]} aria-label={colorNames[item]}>{color === item && <Check size={14} />}</button>)}</div></div><div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button type="submit" className="button primary" disabled={!title.trim()}>{initial ? 'Сохранить' : <><Plus size={16} />Создать цепочку</>}</button></div></form></ModalFrame>
}

function TaskModal({ task, chain, onClose, onSave }: { task: Task; chain: Chain; onClose: () => void; onSave: (value: { title: string; description: string; priority: Priority; dueDate: string; reminderAt: string; dependsOn: string[]; repeat: RepeatRule; estimateMinutes: number | null }) => void }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [dueDate, setDueDate] = useState(task.dueDate)
  const [reminderAt, setReminderAt] = useState(task.reminderAt ?? '')
  const [repeat, setRepeat] = useState<RepeatRule>(task.repeat ?? 'none')
  const [estimate, setEstimate] = useState(task.estimateMinutes?.toString() ?? '')
  const [dependsOn, setDependsOn] = useState<string[]>(task.dependsOn ?? [])
  const candidates = chain.tasks.filter((candidate) => candidate.id !== task.id && chain.tasks.findIndex((item) => item.id === candidate.id) < chain.tasks.findIndex((item) => item.id === task.id) && !dependsTransitively(chain, candidate.id, task.id))
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (title.trim()) onSave({ title: title.trim(), description: description.trim(), priority, dueDate, reminderAt, dependsOn, repeat, estimateMinutes: estimate.trim() ? Math.min(1440, Math.max(1, Number(estimate))) : null }) }
  const toggleDependency = (id: string) => setDependsOn((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  return <ModalFrame onClose={onClose}><form className="modal-card" onSubmit={submit}><div className="modal-header"><div><div className="eyebrow">РЕДАКТИРОВАНИЕ ШАГА</div><h2>Детали задачи</h2><p>Контекст, срок, повторение и зависимости.</p></div><button type="button" className="icon-button" onClick={onClose}><X size={18} /></button></div>
    <label className="field-label">Название<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required /></label><label className="field-label">Описание <span className="optional-label">необязательно</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Что важно помнить об этой задаче?" rows={3} maxLength={500} /></label>
    <div className="form-two-columns"><label className="field-label">Приоритет<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">Низкий</option><option value="medium">Обычный</option><option value="high">Высокий</option></select></label><label className="field-label">Срок<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label></div>
    <div className="form-two-columns"><label className="field-label">Повторение<select value={repeat} onChange={(event) => setRepeat(event.target.value as RepeatRule)}>{Object.entries(repeatNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Оценка времени, мин.<input type="number" min="1" max="1440" value={estimate} onChange={(event) => setEstimate(event.target.value)} placeholder="Например, 30" /></label></div>
    <label className="field-label reminder-input-label">Напомнить в <input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} /><span className="field-hint">В установленном приложении появится системное уведомление, даже когда окно скрыто в трее.</span></label>
    {chain.mode === 'dependencies' && candidates.length > 0 && <div className="field-label dependency-picker">Зависит от <span className="field-hint">Можно выбрать несколько предыдущих задач. Они откроют эту задачу после завершения.</span>{candidates.map((candidate) => <label className="dependency-option" key={candidate.id}><input type="checkbox" checked={dependsOn.includes(candidate.id)} onChange={() => toggleDependency(candidate.id)} /><span>{candidate.title}</span>{candidate.completed && <CheckCircle2 size={14} />}</label>)}</div>}
    {chain.mode === 'sequential' && <div className="inline-info"><LockKeyhole size={15} />В последовательном режиме порядок задаётся расположением задач.</div>}
    <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button type="submit" className="button primary" disabled={!title.trim()}>Сохранить изменения</button></div></form></ModalFrame>
}

function ArchivePage({ chains, hasSearch, onRestore, onDelete, onClearSearch, onOverview }: { chains: Chain[]; hasSearch: boolean; onRestore: (id: string) => void; onDelete: (id: string) => void; onClearSearch: () => void; onOverview: () => void }) {
  return <section className="archive-page"><div className="page-heading"><div className="eyebrow">ПРОСТРАНСТВО</div><h1>Архив</h1><p>Отложенные цепочки можно восстановить в любой момент.</p></div>{chains.length ? <div className="chain-card-grid">{chains.map((chain) => <div className="archive-card" key={chain.id}><div className={`chain-card-symbol ${chain.color}`}><Archive size={18} /></div><h3>{chain.title}</h3><p>{chain.description || 'Без описания'}</p><div className="archive-card-meta">{chain.tasks.length} {taskWord(chain.tasks.length)} · {progressOf(chain)}% выполнено</div><div className="archive-card-actions"><button className="button secondary" onClick={() => onRestore(chain.id)}><ArrowLeft size={14} />Восстановить</button><button className="icon-button danger" onClick={() => onDelete(chain.id)} title="Удалить"><Trash2 size={16} /></button></div></div>)}</div> : <EmptyState icon={<Archive size={24} />} title={hasSearch ? 'В архиве ничего не найдено' : 'Архив пока пуст'} text={hasSearch ? 'Попробуй изменить запрос.' : 'Перемести ненужную сейчас цепочку в архив — она останется здесь.'} action={hasSearch ? 'Очистить поиск' : 'К обзору'} onAction={hasSearch ? onClearSearch : onOverview} />}</section>
}

function CalendarPage({ chains, month, setMonth, view, setView, onOpenTask }: { chains: Chain[]; month: Date; setMonth: (date: Date) => void; view: 'month' | 'timeline'; setView: (view: 'month' | 'timeline') => void; onOpenTask: (chainId: string, taskId: string) => void }) {
  const tasks = chains.flatMap((chain) => chain.tasks.filter((task) => task.dueDate).map((task) => ({ ...task, chainId: chain.id, chainTitle: chain.title, chainColor: chain.color }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((startOffset + days) / 7) * 7 }, (_, index) => { const day = index - startOffset + 1; return day > 0 && day <= days ? day : null })
  const monthName = month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  return <section className="calendar-page"><div className="page-heading calendar-heading"><div><div className="eyebrow">ПЛАНИРОВАНИЕ</div><h1>Календарь</h1><p>Сроки всех активных цепочек в одном представлении.</p></div><div className="calendar-view-toggle"><button className={view === 'month' ? 'selected' : ''} onClick={() => setView('month')}>Месяц</button><button className={view === 'timeline' ? 'selected' : ''} onClick={() => setView('timeline')}>Список</button></div></div>
    {view === 'month' ? <div className="calendar-board"><div className="calendar-monthbar"><button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Предыдущий месяц"><ChevronLeft size={18} /></button><h2>{monthName}</h2><button className="icon-button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Следующий месяц"><ChevronRight size={18} /></button><button className="button secondary today-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Сегодня</button></div><div className="calendar-grid">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{cells.map((day, index) => { const date = day ? toLocalISO(new Date(month.getFullYear(), month.getMonth(), day)) : ''; const dayTasks = tasks.filter((task) => task.dueDate === date); return <div className={cn('calendar-cell', !day && 'outside', date === todayISO() && 'today')} key={`${index}-${date || 'blank'}`}><span className="calendar-day-number">{day ?? ''}</span>{dayTasks.slice(0, 3).map((task) => <button className={cn('calendar-task-chip', task.chainColor, task.completed && 'done')} key={task.id} onClick={() => onOpenTask(task.chainId, task.id)} title={`${task.chainTitle}: ${task.title}`}>{task.title}</button>)}{dayTasks.length > 3 && <span className="calendar-more">+{dayTasks.length - 3} ещё</span>}</div> })}</div></div> : <div className="timeline-list">{tasks.length ? tasks.map((task) => <button className="timeline-item" key={task.id} onClick={() => onOpenTask(task.chainId, task.id)}><span className={`timeline-color ${task.chainColor}`} /><span className="timeline-date">{dateLabel(task.dueDate)}<small>{new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long' })}</small></span><span className="timeline-copy"><strong className={task.completed ? 'line-through' : ''}>{task.title}</strong><small>{task.chainTitle}</small></span><span className={cn('timeline-status', task.completed && 'done')}>{task.completed ? 'Готово' : isOverdue(task) ? 'Просрочено' : 'Запланировано'}</span><ArrowRight size={16} /></button>) : <EmptyState icon={<CalendarDays size={24} />} title="Нет датированных задач" text="Добавь сроки в деталях задач — они появятся здесь." action="К обзору" onAction={() => setView('month')} />}</div>}</section>
}

function TemplatesPage({ templates: items, onApply, onCreate }: { templates: Template[]; onApply: (template: Template) => void; onCreate: () => void }) {
  return <section className="templates-page"><div className="page-heading"><div className="eyebrow">БЫСТРЫЙ СТАРТ</div><h1>Шаблоны цепочек</h1><p>Выбери готовую структуру и адаптируй её под себя.</p></div><div className="template-grid">{items.map((template) => <article className="template-card" key={template.id}><div className={`chain-card-symbol ${template.color}`}><WandSparkles size={18} /></div><h3>{template.title}</h3><p>{template.description}</p><div className="template-meta"><span>{template.tasks.length} шагов</span><span>{modeNames[template.mode]}</span></div><ol>{template.tasks.slice(0, 4).map((task, index) => <li key={index}>{task.title}</li>)}</ol><button className="button primary" onClick={() => onApply(template)}><Plus size={15} />Использовать шаблон</button></article>)}</div><div className="template-custom"><div className="template-custom-icon"><NotebookPen size={20} /></div><div><strong>Хочешь начать с чистого листа?</strong><p>Создай цепочку и настрой её структуру самостоятельно.</p></div><button className="button secondary" onClick={onCreate}>Создать свою <ArrowRight size={15} /></button></div></section>
}

function SettingsPage({ palette, setPalette, onExport, onImport, onUndo, hasUndo, totalChains, totalTasks, totalSubtasks }: { palette: PaletteType; setPalette: (palette: PaletteType) => void; onExport: () => void; onImport: () => void; onUndo: () => void; hasUndo: boolean; totalChains: number; totalTasks: number; totalSubtasks: number }) {
  return <section className="settings-page"><div className="page-heading"><div className="eyebrow">ПЕРСОНАЛИЗАЦИЯ</div><h1>Настройки</h1><p>Настрой внешний вид и управляй своими данными.</p></div><div className="settings-grid"><div className="settings-card"><div className="settings-card-title"><div className="settings-icon"><Palette size={18} /></div><div><h3>Оформление</h3><p>Переключай светлый и тёмный режим одной кнопкой.</p></div></div><p className="theme-tip">Светлый и тёмный режим переключаются одной кнопкой с иконкой солнца или луны в верхней панели.</p><div className="settings-divider" /><strong className="subsection-title">Цветовая палитра</strong><div className="palette-grid">{(Object.keys(paletteNames) as PaletteType[]).map((item) => <button className={cn('palette-option', palette === item && 'selected')} key={item} onClick={() => setPalette(item)}><span style={{ background: paletteSwatches[item] }} /><span>{paletteNames[item]}</span>{palette === item && <Check size={15} />}</button>)}</div></div>
    {window.liniyaDesktop?.isDesktop && <DesktopSettings />}
    <div className="settings-card"><div className="settings-card-title"><div className="settings-icon"><Archive size={18} /></div><div><h3>Резервные копии</h3><p>Данные хранятся в IndexedDB на этом устройстве.</p></div></div><div className="backup-actions"><button className="button secondary" onClick={onExport}><Download size={16} />Экспортировать данные</button><button className="button secondary" onClick={onImport}><Upload size={16} />Импортировать копию</button><button className="button secondary" disabled={!hasUndo} onClick={onUndo}><Undo2 size={16} />Отменить последнее действие</button></div></div>
    <div className="settings-card data-card"><div className="settings-card-title"><div className="settings-icon"><BarChart3 size={18} /></div><div><h3>Твоё пространство</h3><p>Локальная статистика приложения.</p></div></div><div className="data-stat-grid"><div><strong>{totalChains}</strong><span>цепочек</span></div><div><strong>{totalTasks}</strong><span>задач</span></div><div><strong>{totalSubtasks}</strong><span>подзадач</span></div></div></div>
    <div className="settings-card shortcuts-card"><div className="settings-card-title"><div className="settings-icon"><Keyboard size={18} /></div><div><h3>Горячие клавиши</h3><p>Быстрые действия с клавиатуры.</p></div></div><div className="shortcut-list"><span>Поиск</span><kbd>Ctrl / ⌘ K</kbd><span>Новая цепочка</span><kbd>Ctrl / ⌘ N</kbd><span>Обзор</span><kbd>Ctrl / ⌘ 1</kbd><span>Режим фокуса</span><kbd>Ctrl / ⌘ J</kbd><span>Закрыть окно</span><kbd>Esc</kbd></div></div></div><p className="settings-footnote"><CircleHelp size={14} />Все задачи и настройки остаются на этом устройстве. Для переноса на другой компьютер используй экспорт.</p></section>
}

function DesktopSettings() {
  const api = window.liniyaDesktop
  const [settings, setSettings] = useState<LiniyaDesktopSettings>({ launchAtLogin: false, closeToTray: true })
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api?.getSettings().then((value) => setSettings(value)).catch(() => setMessage('Не удалось загрузить настройки приложения.')).finally(() => setLoaded(true))
  }, [api])

  const update = async (patch: Partial<LiniyaDesktopSettings>) => {
    if (!api) return
    try {
      const next = await api.setPreferences({ ...settings, ...patch })
      setSettings(next)
      setMessage('Настройки сохранены')
    } catch {
      setMessage('Не удалось сохранить настройки')
    }
  }

  const test = async () => {
    if (!api) return
    try {
      const result = await api.testNotification()
      setMessage(result.ok ? 'Тестовое уведомление отправлено' : (result.message ?? 'Уведомление недоступно'))
    } catch {
      setMessage('Не удалось отправить тестовое уведомление')
    }
  }

  return <div className="settings-card desktop-settings-card">
    <div className="settings-card-title"><div className="settings-icon"><Bell size={18} /></div><div><h3>Настольное приложение</h3><p>Линия работает в фоне и отправляет системные уведомления Windows.</p></div></div>
    <label className="desktop-setting-row"><span><strong>Запускать вместе с Windows</strong><small>Приложение откроется скрытым в системном трее после входа.</small></span><input type="checkbox" checked={settings.launchAtLogin} disabled={!loaded} onChange={(event) => update({ launchAtLogin: event.target.checked })} /></label>
    <label className="desktop-setting-row"><span><strong>Сворачивать в трей</strong><small>При сворачивании или закрытии окна приложение продолжит работать рядом с часами.</small></span><input type="checkbox" checked={settings.closeToTray} disabled={!loaded} onChange={(event) => update({ closeToTray: event.target.checked })} /></label>
    <div className="backup-actions"><button className="button secondary" onClick={test}><Bell size={15} />Проверить уведомление</button></div>
    {message && <p className="desktop-settings-message" role="status">{message}</p>}
    <p className="theme-tip">Чтобы полностью закрыть приложение, нажми правой кнопкой по значку «Линии» в трее и выбери «Полностью выйти».</p>
  </div>
}

function FocusPage({ task, chain, seconds, duration, setDuration, running, setRunning, onBack, onComplete, onSelectNext }: { task: Task | null; chain: Chain | null; seconds: number; duration: number; setDuration: (minutes: number) => void; running: boolean; setRunning: (running: boolean) => void; onBack: () => void; onComplete: () => void; onSelectNext: () => void }) {
  const progress = duration > 0 ? ((duration * 60 - seconds) / (duration * 60)) * 100 : 0
  return <section className="focus-page"><div className="focus-header"><button className="button secondary" onClick={onBack}><ArrowLeft size={15} />Вернуться</button><span className="eyebrow">РЕЖИМ КОНЦЕНТРАЦИИ</span><span className="focus-session-label"><span className={cn('status-dot', running && 'pulse')} />{running ? 'Сессия идёт' : 'Готов к фокусу'}</span></div>{task && chain ? <div className="focus-content"><div className="focus-task-overline"><span className={`chain-dot ${chain.color}`} />{chain.title}</div><h1>{task.title}</h1><p>{task.description || 'Сосредоточься на этом шаге. Остальное подождёт.'}</p>{task.dueDate && <div className="focus-due"><CalendarDays size={15} />Срок: {dateLabel(task.dueDate)}</div>}<div className="focus-timer-wrap"><div className="focus-timer-ring" style={{ background: `conic-gradient(var(--accent) ${progress}%, var(--surface-muted) ${progress}% 100%)` }}><div className="focus-timer-inner"><span className="timer-caption">ОСТАЛОСЬ</span><strong>{formatMinutes(seconds)}</strong><span className="timer-mode">{duration} минут фокуса</span></div></div></div><div className="focus-duration"><span>Длительность</span>{[15, 25, 45, 60].map((minutes) => <button key={minutes} className={duration === minutes ? 'selected' : ''} onClick={() => setDuration(minutes)}>{minutes} мин</button>)}</div><div className="focus-controls"><button className="button secondary" onClick={() => setDuration(duration)}><RotateCcw size={16} />Сбросить</button><button className="button primary focus-play" onClick={() => setRunning(!running)}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? 'Пауза' : 'Начать'}</button><button className="button secondary" onClick={onComplete}><Check size={16} />Готово</button></div><button className="focus-next-link" onClick={onSelectNext}>Выбрать другую задачу <ArrowRight size={15} /></button></div> : <EmptyState icon={<Focus size={24} />} title="Сейчас нет доступных задач" text="Добавь задачи или заверши заблокированные предыдущие шаги, чтобы начать фокус-сессию." action="Вернуться к обзору" onAction={onBack} />}</section>
}

function ModalFrame({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', onKey); document.body.classList.add('modal-open'); return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open') } }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal-positioner">{children}</div></div>
}
function EmptyState({ icon, title, text, action, onAction }: { icon: ReactNode; title: string; text: string; action: string; onAction: () => void }) { return <div className="large-empty"><div className="large-empty-icon">{icon}</div><h2>{title}</h2><p>{text}</p><button className="button secondary" onClick={onAction}>{action}</button></div> }
function modeDescription(mode: ChainMode) { if (mode === 'sequential') return 'Следующий шаг откроется, когда завершишь предыдущий.'; if (mode === 'dependencies') return 'Задачи открываются после выбранных зависимостей; ветки могут идти параллельно.'; return 'Любую задачу можно выполнять в любом порядке.' }
function dependsTransitively(chain: Chain, taskId: string, targetId: string, visited = new Set<string>()): boolean {
  if (taskId === targetId) return true
  if (visited.has(taskId)) return false
  visited.add(taskId)
  const task = chain.tasks.find((item) => item.id === taskId)
  return task?.dependsOn.some((dependencyId) => dependsTransitively(chain, dependencyId, targetId, visited)) ?? false
}
function getNextFocusTask(chains: Chain[], exclude?: { chainId: string; taskId: string }) {
  const candidates = chains.flatMap((chain) => chain.tasks.filter((task) => !task.completed && !isTaskLocked(chain, task) && !(exclude?.chainId === chain.id && exclude.taskId === task.id)).map((task) => ({ chainId: chain.id, taskId: task.id, task, chain })))
  candidates.sort((a, b) => {
    const p = { high: 0, medium: 1, low: 2 }
    const priority = p[a.task.priority] - p[b.task.priority]
    if (priority !== 0) return priority
    const aDate = a.task.dueDate || '9999-12-31'; const bDate = b.task.dueDate || '9999-12-31'
    return aDate.localeCompare(bDate)
  })
  const first = candidates[0]
  return first ? { chainId: first.chainId, taskId: first.taskId } : null
}
function chainMatches(chain: Chain, search: string) { const content = `${chain.title} ${chain.description} ${chain.tasks.map((task) => `${task.title} ${task.description} ${task.subtasks.map((subtask) => subtask.title).join(' ')}`).join(' ')}`; return content.toLowerCase().includes(search.toLowerCase()) }
function truncate(value: string, max: number) { return value.length > max ? `${value.slice(0, max - 1)}…` : value }
function pageTitle(page: string, chainTitle?: string) { return ({ overview: 'Обзор', chain: chainTitle ?? 'Цепочка', archive: 'Архив', calendar: 'Календарь', focus: 'Фокус', templates: 'Шаблоны', settings: 'Настройки' } as Record<string, string>)[page] ?? 'Линия' }
function chainWord(value: number) { const n = value % 10; const n100 = value % 100; if (n === 1 && n100 !== 11) return 'цепочка'; if ([2, 3, 4].includes(n) && ![12, 13, 14].includes(n100)) return 'цепочки'; return 'цепочек' }
function taskWord(value: number) { const n = value % 10; const n100 = value % 100; if (n === 1 && n100 !== 11) return 'задача'; if ([2, 3, 4].includes(n) && ![12, 13, 14].includes(n100)) return 'задачи'; return 'задач' }
function isValidChain(value: unknown): value is Chain {
  if (!value || typeof value !== 'object') return false
  const chain = value as Partial<Chain>
  if (typeof chain.id !== 'string' || typeof chain.title !== 'string' || typeof chain.description !== 'string' || !chainColors.includes(chain.color as typeof chainColors[number]) || typeof chain.createdAt !== 'string' || typeof chain.archived !== 'boolean' || !Array.isArray(chain.tasks) || chain.tasks.length > 5000) return false
  if (chain.mode !== undefined && !['free', 'sequential', 'dependencies'].includes(chain.mode)) return false
  return chain.tasks.every((task) => {
    if (!task || typeof task !== 'object') return false
    if (typeof task.id !== 'string' || typeof task.title !== 'string' || typeof task.description !== 'string' || typeof task.completed !== 'boolean' || !['low', 'medium', 'high'].includes(task.priority) || typeof task.dueDate !== 'string' || typeof task.createdAt !== 'string' || !(typeof task.completedAt === 'string' || task.completedAt === null) || !Array.isArray(task.subtasks)) return false
    if (task.dependsOn !== undefined && (!Array.isArray(task.dependsOn) || !task.dependsOn.every((id) => typeof id === 'string'))) return false
    if (task.repeat !== undefined && !['none', 'daily', 'weekly', 'monthly'].includes(task.repeat)) return false
    if (task.estimateMinutes !== undefined && task.estimateMinutes !== null && (typeof task.estimateMinutes !== 'number' || !Number.isFinite(task.estimateMinutes))) return false
    if (task.reminderAt !== undefined && typeof task.reminderAt !== 'string') return false
    return task.subtasks.every((subtask) => subtask && typeof subtask.id === 'string' && typeof subtask.title === 'string' && typeof subtask.completed === 'boolean')
  })
}

export default App
