import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildUserProfile,
  classifyEmail,
  filterAndSortInbox,
  matchesSmartFilter,
  rankFilters,
  senderFilter,
  type BuiltinSmartFilter,
  type EmailSignals,
  type FilterId,
  type SortBy,
} from "./inbox/smart";
import { formatListTime } from "./inbox/time";
import { MOCK_INBOX, MOCK_TRASH } from "./mock/mail";
import type { RelayEmail, TrashRow } from "./inbox/types";
import { isAuthenticated, getAccessToken, signOut } from "./services/auth";
import { fetchGmailMessages } from "./services/gmail";
import LoginScreen from "./components/LoginScreen";
import SettingsPage from "./Settings";
import EmailViewer from "./EmailViewer";
import {
  BellRing,
  Flag,
  Inbox,
  Newspaper,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  Star,
  Tag,
  TriangleAlert,
} from "lucide-react";

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [screen, setScreen] = useState<"inbox" | "settings">("inbox");
  const [activeFilters, setActiveFilters] = useState<FilterId[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<RelayEmail | null>(null);
  const [leaving, setLeaving] = useState<
    { email: RelayEmail; sig: EmailSignals }[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortSubmenu, setSortSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [inbox, setInbox] = useState<RelayEmail[]>(MOCK_INBOX);
  const [trash, setTrash] = useState<TrashRow[]>(MOCK_TRASH);
  const [loading, setLoading] = useState(false);
  const [usingMock, setUsingMock] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const loadGmail = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;

    setLoading(true);
    try {
      const { emails, trash: trashRows } = await fetchGmailMessages(token, 100);
      if (emails.length > 0) {
        setInbox(emails);
        setTrash(trashRows);
        setUsingMock(false);
        setLastSync(new Date());
      }
    } catch (err) {
      if (err instanceof Error && err.message === "TOKEN_EXPIRED") {
        await signOut();
        setAuthed(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      loadGmail();
    }
  }, [authed, loadGmail]);

  const profile = useMemo(() => buildUserProfile(inbox, trash), [inbox, trash]);

  const emailSignals = useMemo(() => {
    const map = new Map<number, EmailSignals>();
    for (const email of inbox) {
      map.set(email.id, classifyEmail(email, profile));
    }
    return map;
  }, [inbox, profile]);

  const filteredEmails = useMemo(
    () =>
      filterAndSortInbox(
        inbox,
        trash,
        activeFilters,
        searchQuery,
        sortBy,
        profile,
      ),
    [activeFilters, searchQuery, sortBy, inbox, trash, profile],
  );

  const senderShortcuts = profile.topSenders.slice(0, 3);

  const rankedFilters = useMemo(
    () => rankFilters(inbox, trash, profile),
    [inbox, trash, profile],
  );

  /** Built-in filters that overlap with the currently visible emails. */
  const compatibleFilters = useMemo(() => {
    if (activeFilters.length === 0) return rankedFilters;
    return rankedFilters.filter(({ id }) =>
      filteredEmails.some((email) => {
        const sig = emailSignals.get(email.id)!;
        return matchesSmartFilter(id, email, sig, profile);
      }),
    );
  }, [rankedFilters, filteredEmails, activeFilters, profile, emailSignals]);

  /** Sender filters that appear in the currently visible emails. */
  const compatibleSenders = useMemo(() => {
    if (activeFilters.length === 0) return senderShortcuts;
    return senderShortcuts.filter((s) =>
      filteredEmails.some((e) => e.sender === s),
    );
  }, [senderShortcuts, filteredEmails, activeFilters]);

  const filterStripRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const velocity = useRef(0);
  const lastMoveX = useRef(0);
  const lastMoveTime = useRef(0);
  const flipRects = useRef<Map<string, number>>(new Map());
  const momentumId = useRef(0);
  const snapTimer = useRef(0);
  const releaseScrollLeft = useRef(0);
  const prevFiltered = useRef<RelayEmail[]>([]);
  const clearTimer = useRef(0);
  const MAX_DISPLACEMENT = 400;

  function snapToTarget() {
    if (!filterStripRef.current) return;
    filterStripRef.current.scrollTo({ left: 0, behavior: "smooth" });
  }

  function startMomentum() {
    const step = () => {
      if (!filterStripRef.current) return;
      velocity.current *= 0.92;
      if (
        Math.abs(velocity.current) < 0.5 ||
        Math.abs(
          filterStripRef.current.scrollLeft - releaseScrollLeft.current,
        ) >= MAX_DISPLACEMENT
      ) {
        scheduleSnap();
        return;
      }
      filterStripRef.current.scrollLeft -= velocity.current;
      momentumId.current = requestAnimationFrame(step);
    };
    momentumId.current = requestAnimationFrame(step);
  }

  function scheduleSnap() {
    window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(snapToTarget, 3000);
  }

  function dragStart(pageX: number) {
    cancelAnimationFrame(momentumId.current);
    window.clearTimeout(snapTimer.current);
    dragging.current = false;
    velocity.current = 0;
    dragStartX.current = pageX;
    lastMoveX.current = pageX;
    lastMoveTime.current = performance.now();
    if (filterStripRef.current)
      dragScrollLeft.current = filterStripRef.current.scrollLeft;
  }

  function dragMove(pageX: number) {
    const now = performance.now();
    const dt = now - lastMoveTime.current;
    if (dt > 0) velocity.current = ((pageX - lastMoveX.current) / dt) * 16;
    lastMoveX.current = pageX;
    lastMoveTime.current = now;
    if (Math.abs(pageX - dragStartX.current) > 4) dragging.current = true;
    if (filterStripRef.current)
      filterStripRef.current.scrollLeft =
        dragScrollLeft.current - (pageX - dragStartX.current);
  }

  function dragEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    releaseScrollLeft.current = filterStripRef.current?.scrollLeft ?? 0;
    if (Math.abs(velocity.current) > 0.5) startMomentum();
    else scheduleSnap();
  }

  function handleFilterMouseDown(e: React.MouseEvent) {
    dragStart(e.pageX);
  }
  function handleFilterMouseMove(e: React.MouseEvent) {
    if (e.buttons !== 1) return;
    e.preventDefault();
    dragMove(e.pageX);
  }
  function handleFilterMouseUp() {
    dragEnd();
  }

  function handleFilterTouchStart(e: React.TouchEvent) {
    dragStart(e.touches[0].pageX);
  }
  function handleFilterTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    dragMove(e.touches[0].pageX);
  }
  function handleFilterTouchEnd() {
    dragEnd();
  }
  function handleFilterTouchCancel() {
    dragging.current = false;
  }

  function captureFlipRects() {
    if (!filterStripRef.current) return;
    const items =
      filterStripRef.current.querySelectorAll<HTMLElement>("[data-flip]");
    const rects = new Map<string, number>();
    items.forEach((el) =>
      rects.set(el.dataset.flip!, el.getBoundingClientRect().left),
    );
    flipRects.current = rects;
  }

  /** FLIP animation — slides items to their new positions after filter toggles. */
  useLayoutEffect(() => {
    const el = filterStripRef.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-flip]");
    const next = new Map<string, number>();
    const anims: { el: HTMLElement; dx: number }[] = [];

    items.forEach((btn) => {
      const key = btn.dataset.flip!;
      const rect = btn.getBoundingClientRect();
      const prev = flipRects.current.get(key);
      if (prev !== undefined && Math.abs(prev - rect.left) > 1) {
        anims.push({ el: btn, dx: prev - rect.left });
      }
      next.set(key, rect.left);
    });
    flipRects.current = next;

    if (anims.length === 0) return;

    anims.forEach(({ el, dx }) => {
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
    });

    void el.offsetHeight;

    requestAnimationFrame(() => {
      anims.forEach(({ el }) => {
        el.style.transition = "transform 0.25s ease-out";
        el.style.transform = "";
        const done = () => {
          el.style.transition = "";
          el.removeEventListener("transitionend", done);
        };
        el.addEventListener("transitionend", done);
      });
    });
  }, [activeFilters]);

  /** Exit animation — keeps leaving emails in the DOM until their reverse-appear finishes. */
  useLayoutEffect(() => {
    const prev = prevFiltered.current;
    if (prev.length === 0) {
      prevFiltered.current = filteredEmails;
      return;
    }
    const currSet = new Set(filteredEmails.map((e) => e.id));
    const gone = prev.filter((e) => !currSet.has(e.id));
    if (gone.length > 0) {
      setLeaving(
        gone.map((email) => ({ email, sig: emailSignals.get(email.id)! })),
      );
      window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setLeaving([]), 250);
    }
    prevFiltered.current = filteredEmails;
  }, [filteredEmails, profile]);

  function clearAllFilters() {
    if (dragging.current) return;
    window.clearTimeout(snapTimer.current);
    captureFlipRects();
    setActiveFilters([]);
  }

  function toggleFilter(id: FilterId) {
    if (dragging.current) return;
    window.clearTimeout(snapTimer.current);
    captureFlipRects();
    setActiveFilters((prev) => {
      if (prev.includes(id)) return prev.filter((f) => f !== id);
      if (id === "unsafe") return [id];
      return [...prev, id];
    });
  }

  useEffect(() => {
    snapToTarget();
  }, [activeFilters]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        !filterStripRef.current ||
        filterStripRef.current.contains(e.target as Node)
      )
        return;
      window.clearTimeout(snapTimer.current);
      snapToTarget();
    }
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      window.clearTimeout(snapTimer.current);
      cancelAnimationFrame(momentumId.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    setSortSubmenu(false);
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const BUILTIN_FILTER_PALETTE: Record<
    BuiltinSmartFilter,
    { bg: string; border: string; text: string; glow: string }
  > = {
    important: {
      bg: "rgba(251,191,36,0.52)",
      border: "rgba(251,191,36,0.56)",
      text: "rgb(120,53,15)",
      glow: "rgba(251,191,36,0.38)",
    },
    urgent: {
      bg: "rgba(251,113,133,0.54)",
      border: "rgba(251,113,133,0.62)",
      text: "rgb(136,19,55)",
      glow: "rgba(251,113,133,0.42)",
    },
    security: {
      bg: "rgba(125,211,252,0.5)",
      border: "rgba(56,189,248,0.54)",
      text: "rgb(12,74,110)",
      glow: "rgba(56,189,248,0.34)",
    },
    starred: {
      bg: "rgba(250,204,21,0.53)",
      border: "rgba(234,179,8,0.58)",
      text: "rgb(113,63,18)",
      glow: "rgba(234,179,8,0.38)",
    },
    top_contacts: {
      bg: "rgba(167,139,250,0.5)",
      border: "rgba(139,92,246,0.54)",
      text: "rgb(76,29,149)",
      glow: "rgba(139,92,246,0.32)",
    },
    quiet_contacts: {
      bg: "rgba(191,219,254,0.48)",
      border: "rgba(147,197,253,0.5)",
      text: "rgb(30,64,175)",
      glow: "rgba(96,165,250,0.28)",
    },
    newsletters: {
      bg: "rgba(209,213,219,0.54)",
      border: "rgba(156,163,175,0.52)",
      text: "rgb(55,65,81)",
      glow: "rgba(148,163,184,0.26)",
    },
    promotional: {
      bg: "rgba(74,222,128,0.55)",
      border: "rgba(34,197,94,0.58)",
      text: "rgb(21,128,61)",
      glow: "rgba(34,197,94,0.35)",
    },
    low_priority: {
      bg: "rgba(226,232,240,0.58)",
      border: "rgba(148,163,184,0.5)",
      text: "rgb(51,65,85)",
      glow: "rgba(148,163,184,0.28)",
    },
    unsafe: {
      bg: "rgba(253,186,116,0.53)",
      border: "rgba(251,146,60,0.58)",
      text: "rgb(124,45,18)",
      glow: "rgba(249,115,22,0.36)",
    },
  };

  const FILTER_ICON: Partial<Record<BuiltinSmartFilter, React.ElementType>> = {
    important: Flag,
    urgent: BellRing,
    security: Shield,
    starred: Star,
    newsletters: Newspaper,
    promotional: Tag,
    unsafe: TriangleAlert,
  };

  function hashSender(sender: string): number {
    let hash = 0;
    for (let i = 0; i < sender.length; i += 1) {
      hash = (hash * 31 + sender.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function avatarColor(sender: string): string {
    return `hsl(${hashSender(sender) % 360} 55% 50%)`;
  }

  function pastelFromSender(sender: string): {
    bg: string;
    border: string;
    text: string;
    glow: string;
  } {
    const hue = hashSender(sender) % 360;
    return {
      bg: `hsl(${hue} 78% 90%)`,
      border: `hsl(${hue} 60% 73%)`,
      text: `hsl(${hue} 42% 28%)`,
      glow: `hsl(${hue} 74% 80%)`,
    };
  }

  function pillClasses(on: boolean) {
    const glass =
      "relative inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap animate-appear transition-[background-color,box-shadow,transform,border-color,color] duration-200 ease-out " +
      "backdrop-blur-xl backdrop-saturate-150 " +
      "border " +
      "active:scale-[0.98] " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:focus-visible:ring-offset-neutral-950";
    return `${glass} ${
      on
        ? "scale-[1.04] -translate-y-0.5 ring-2 ring-white/65 drop-shadow-lg dark:ring-white/20"
        : "border-slate-200/70 bg-white/60 text-slate-900 shadow-sm dark:border-neutral-700/60 dark:bg-neutral-800/60 dark:text-neutral-100"
    }`;
  }

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="mx-auto flex h-screen w-full max-w-lg flex-col bg-neutral-50 text-neutral-900 shadow-2xl dark:bg-black dark:text-neutral-100">
      {selectedEmail ? (
        <EmailViewer email={selectedEmail} onBack={() => setSelectedEmail(null)} profile={profile} />
      ) : (
      <>
      {/* Search bar */}
      <header className="flex gap-4 items-center px-6 py-4 bg-white/70 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100 dark:bg-black/70 dark:border-neutral-800">
        <div className="w-10 h-10 shrink-0 rounded-full bg-white/30 backdrop-blur-xl border border-white/60 dark:bg-neutral-700/40 dark:border-neutral-600/60 flex items-center justify-center">
          <picture>
            <source
              srcSet="/relay-dark.svg"
              media="(prefers-color-scheme: dark)"
            />
            <img
              src="/relay-light.svg"
              className="w-7 h-7 opacity-80"
              alt="Relay"
            />
          </picture>
        </div>

        <input
          type="search"
          placeholder={screen === "inbox" ? "Search emails..." : "Search settings..."}
          aria-label="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-slate-400 dark:placeholder:text-neutral-500"
        />

        {loading && (
          <RefreshCw size={16} className="animate-spin text-slate-400" />
        )}

        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-neutral-800"
          >
            <div className="flex flex-col gap-0.5">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full dark:bg-neutral-500" />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full dark:bg-neutral-500" />
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full dark:bg-neutral-500" />
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-2xl bg-white/80 backdrop-blur-2xl backdrop-saturate-150 shadow-xl shadow-black/10 border border-white/60 dark:bg-neutral-800/80 dark:border-neutral-700/60">
              <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
                {sortSubmenu ? "Sort by" : "Options"}
              </div>
              <hr className="border-slate-200/60 dark:border-neutral-700/60" />
              {sortSubmenu ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSortBy("date");
                      setMenuOpen(false);
                      setSortSubmenu(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      sortBy === "date"
                        ? "text-blue-600 font-semibold dark:text-blue-400"
                        : "text-slate-700 dark:text-neutral-300"
                    } hover:bg-slate-100/60 dark:hover:bg-neutral-700/60`}
                  >
                    Date
                    {sortBy === "date" && (
                      <span className="float-right">✓</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortBy("sender");
                      setMenuOpen(false);
                      setSortSubmenu(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      sortBy === "sender"
                        ? "text-blue-600 font-semibold dark:text-blue-400"
                        : "text-slate-700 dark:text-neutral-300"
                    } hover:bg-slate-100/60 dark:hover:bg-neutral-700/60`}
                  >
                    Sender
                    {sortBy === "sender" && (
                      <span className="float-right">✓</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortBy("score");
                      setMenuOpen(false);
                      setSortSubmenu(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      sortBy === "score"
                        ? "text-blue-600 font-semibold dark:text-blue-400"
                        : "text-slate-700 dark:text-neutral-300"
                    } hover:bg-slate-100/60 dark:hover:bg-neutral-700/60`}
                  >
                    Smart Score
                    {sortBy === "score" && (
                      <span className="float-right">✓</span>
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSortSubmenu(true)}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-100/60 dark:hover:bg-neutral-700/60 transition-colors"
                >
                  Sort by
                  <span className="float-right text-slate-400">›</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {screen === "inbox" ? (
        <>
          {/* 2. SCROLLABLE MAIN CONTENT */}
          <main className="min-h-0 flex-1 overflow-y-auto pb-48">
            {/* Email Cards Loop */}
            {filteredEmails.map((email) => {
              const sig = emailSignals.get(email.id)!;
          return (
            <div
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              className="p-5 border-b border-slate-100 bg-white active:bg-slate-50 transition-colors animate-appear cursor-pointer dark:border-neutral-800 dark:bg-black dark:active:bg-neutral-900"
            >
              <div className="flex gap-3 mb-1">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: avatarColor(email.sender) }}
                >
                  {email.sender.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <span className="font-bold text-lg text-slate-900 truncate block dark:text-neutral-100">
                        {email.name ??
                          (email.sender.includes("@")
                            ? email.sender.split("@")[0]
                            : email.sender)}
                      </span>
                      <span className="text-sm text-slate-400 truncate block dark:text-neutral-500">
                        {email.email ?? email.sender}
                      </span>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-2">
                      <span className="text-slate-400 text-sm tabular-nums dark:text-neutral-500">
                        {formatListTime(email.receivedAt)}
                      </span>
                      <div className="flex gap-1.5 mt-1">
                        {email.starred && (
                          <Star
                            size={14}
                            className="text-yellow-500 fill-yellow-500"
                          />
                        )}
                        {sig.importanceScore >= 70 && (
                          <Flag size={14} className="text-orange-500" />
                        )}
                        {sig.urgentText && (
                          <BellRing size={14} className="text-rose-500" />
                        )}
                        {sig.security && (
                          <Shield size={14} className="text-sky-600" />
                        )}
                        {sig.newsletter && (
                          <Newspaper size={14} className="text-neutral-400" />
                        )}
                        {sig.promotional && (
                          <Tag size={14} className="text-emerald-600" />
                        )}
                        {sig.spamLikelihood >= 0.4 && (
                          <TriangleAlert
                            size={14}
                            className="text-orange-500"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="font-semibold text-slate-800 truncate dark:text-neutral-200">
                    {email.subject}
                  </p>
                  <p className="text-slate-500 text-sm truncate mt-0.5 dark:text-neutral-400">
                    {email.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {/* Exiting emails — reverse appear animation */}
        {leaving.map(({ email, sig }) => (
          <div
            key={email.id}
            className="p-5 border-b border-slate-100 bg-white transition-colors dark:border-neutral-800 dark:bg-black animate-[appear_0.25s_ease-out_reverse_forwards]"
          >
            <div className="flex gap-3 mb-1">
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: avatarColor(email.sender) }}
              >
                {email.sender.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <span className="font-bold text-lg text-slate-900 truncate block dark:text-neutral-100">
                      {email.name ??
                        (email.sender.includes("@")
                          ? email.sender.split("@")[0]
                          : email.sender)}
                    </span>
                    <span className="text-sm text-slate-400 truncate block dark:text-neutral-500">
                      {email.email ?? email.sender}
                    </span>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-2">
                    <span className="text-slate-400 text-sm tabular-nums dark:text-neutral-500">
                      {formatListTime(email.receivedAt)}
                    </span>
                    <div className="flex gap-1.5 mt-1">
                      {email.starred && (
                        <Star
                          size={14}
                          className="text-yellow-500 fill-yellow-500"
                        />
                      )}
                      {sig.importanceScore >= 70 && (
                        <Flag size={14} className="text-orange-500" />
                      )}
                      {sig.urgentText && (
                        <BellRing size={14} className="text-rose-500" />
                      )}
                      {sig.security && (
                        <Shield size={14} className="text-sky-600" />
                      )}
                      {sig.newsletter && (
                        <Newspaper size={14} className="text-neutral-400" />
                      )}
                      {sig.promotional && (
                        <Tag size={14} className="text-emerald-600" />
                      )}
                      {sig.spamLikelihood >= 0.4 && (
                        <TriangleAlert size={14} className="text-orange-500" />
                      )}
                    </div>
                  </div>
                </div>
                <p className="font-semibold text-slate-800 truncate dark:text-neutral-200">
                  {email.subject}
                </p>
                <p className="text-slate-500 text-sm truncate mt-0.5 dark:text-neutral-400">
                  {email.body}
                </p>
              </div>
            </div>
          </div>
        ))}
      </main>

      {/* Smart filters: rule-based tags + habit curve (inbox + trash bias only). */}
      <section
        ref={filterStripRef}
        onMouseDown={handleFilterMouseDown}
        onMouseMove={handleFilterMouseMove}
        onMouseUp={handleFilterMouseUp}
        onMouseLeave={handleFilterMouseUp}
        onTouchStart={handleFilterTouchStart}
        onTouchMove={handleFilterTouchMove}
        onTouchEnd={handleFilterTouchEnd}
        onTouchCancel={handleFilterTouchCancel}
        className="fixed bottom-[88px] left-0 right-0 z-40 mx-auto flex max-w-lg gap-2 overflow-x-auto px-4 py-3 scroll-pl-4 [-ms-overflow-style:none] [scrollbar-width:none] border-t border-white/40 bg-gradient-to-t from-neutral-100/40 to-white/25 backdrop-blur-2xl backdrop-saturate-150 [mask-image:linear-gradient(to_top,black_85%,transparent)] touch-none cursor-grab active:cursor-grabbing select-none transition-all duration-300 ease-out dark:border-neutral-800/60 dark:from-neutral-900/50 dark:to-neutral-950/30"
      >
        {[...compatibleFilters]
          .filter((f) => f.id !== "unsafe")
          .sort((a, b) => {
            const aOn = activeFilters.includes(a.id) ? 0 : 1;
            const bOn = activeFilters.includes(b.id) ? 0 : 1;
            if (aOn !== bOn) return aOn - bOn;
            return 0;
          })
          .map(({ id, label }) => {
            const on = activeFilters.includes(id);
            const Icon = FILTER_ICON[id];
            return (
              <button
                key={id}
                type="button"
                data-flip={id}
                data-id={id}
                onClick={() => toggleFilter(id)}
                className={pillClasses(on)}
                style={
                  on
                    ? {
                        backgroundColor: BUILTIN_FILTER_PALETTE[id].bg,
                        borderColor: BUILTIN_FILTER_PALETTE[id].border,
                        color: BUILTIN_FILTER_PALETTE[id].text,
                        boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.78), 0 10px 22px -12px ${BUILTIN_FILTER_PALETTE[id].glow}`,
                      }
                    : undefined
                }
              >
                {Icon && <Icon size={14} className="shrink-0" />}
                <span className="dark:brightness-200">{label}</span>
                {on && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: BUILTIN_FILTER_PALETTE[id].text }}
                  />
                )}
              </button>
            );
          })}
        {[...compatibleSenders]
          .sort((a, b) => {
            const aOn = activeFilters.includes(senderFilter(a)) ? 0 : 1;
            const bOn = activeFilters.includes(senderFilter(b)) ? 0 : 1;
            return aOn - bOn;
          })
          .map((sender) => {
            const id = senderFilter(sender);
            const on = activeFilters.includes(id);
            const senderPalette = pastelFromSender(sender);
            return (
              <button
                key={sender}
                type="button"
                data-flip={id}
                data-id={id}
                onClick={() => toggleFilter(id)}
                className={pillClasses(on)}
                style={
                  on
                    ? {
                        backgroundColor: senderPalette.bg,
                        borderColor: senderPalette.border,
                        color: senderPalette.text,
                        boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.8), 0 10px 22px -12px ${senderPalette.glow}`,
                      }
                    : undefined
                }
              >
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block h-2 w-2 rounded-full align-middle bg-neutral-300 dark:bg-neutral-600"
                  style={
                    on ? { backgroundColor: senderPalette.text } : undefined
                  }
                />
                <span className="dark:brightness-200">From {sender}</span>
              </button>
            );
          })}
      </section>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-48">
          <SettingsPage
            onShowUnsafe={() => {
              setScreen("inbox");
              setActiveFilters(["unsafe"]);
            }}
            onSignOut={async () => {
              await signOut();
              setAuthed(false);
              setInbox(MOCK_INBOX);
              setTrash(MOCK_TRASH);
              setUsingMock(true);
            }}
            isUsingMock={usingMock}
            lastSync={lastSync}
          />
        </div>
      )}

      </>
      )}
      {/* Bottom nav — always visible */}
      <nav
        aria-label="Bottom navigation"
        className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-w-lg items-center justify-between border-t border-slate-100 bg-white/90 px-6 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] backdrop-blur-lg dark:border-neutral-800 dark:bg-black/90"
      >
        <button
          type="button"
          aria-current={activeFilters.length === 0 ? "page" : undefined}
          onClick={() => { setScreen("inbox"); clearAllFilters(); }}
          className={`flex flex-col items-center gap-1 ${screen === "inbox" && activeFilters.length === 0 ? "text-blue-600" : "text-slate-400 dark:text-neutral-500"}`}
        >
          <Inbox size={24} className={activeFilters.length === 0 ? "text-blue-600" : "text-slate-400 dark:text-neutral-500"} />
          <span className="text-[10px] font-bold">Inbox</span>
        </button>
        <div className="flex flex-col items-center gap-1 text-slate-400 dark:text-neutral-500">
          <div className="w-6 h-6 bg-slate-200 rounded-lg dark:bg-neutral-700" />
          <span className="text-[10px] font-medium">To</span>
        </div>
        <button
          type="button"
          onClick={() => setScreen("settings")}
          className={`flex flex-col items-center gap-1 ${screen === "settings" ? "text-blue-600" : "text-slate-400 dark:text-neutral-500"}`}
        >
          <SettingsIcon size={24} className={screen === "settings" ? "text-blue-600" : "text-slate-400 dark:text-neutral-500"} />
          <span className="text-[10px] font-bold">Settings</span>
        </button>
      </nav>
    </div>
  );
}
