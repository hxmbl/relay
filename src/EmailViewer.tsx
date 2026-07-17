import { ArrowLeft, BellRing, Flag, Forward, Info, Newspaper, Reply, ReplyAll, Shield, Star, Tag, Trash2, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import type { RelayEmail } from "./inbox/types";
import { classifyEmail, type EmailSignals } from "./inbox/smart";
import type { BuiltinSmartFilter } from "./inbox/smart";
import { formatListTime } from "./inbox/time";

const PALETTE: Record<
  BuiltinSmartFilter,
  { bg: string; border: string; text: string; glow: string }
> = {
  important: { bg: "rgba(251,191,36,0.52)", border: "rgba(251,191,36,0.56)", text: "rgb(120,53,15)", glow: "rgba(251,191,36,0.38)" },
  urgent: { bg: "rgba(251,113,133,0.54)", border: "rgba(251,113,133,0.62)", text: "rgb(136,19,55)", glow: "rgba(251,113,133,0.42)" },
  security: { bg: "rgba(125,211,252,0.5)", border: "rgba(56,189,248,0.54)", text: "rgb(29,78,216)", glow: "rgba(56,189,248,0.36)" },
  starred: { bg: "rgba(250,204,21,0.44)", border: "rgba(234,179,8,0.5)", text: "rgb(113,63,18)", glow: "rgba(234,179,8,0.32)" },
  newsletters: { bg: "rgba(148,163,184,0.38)", border: "rgba(148,163,184,0.42)", text: "rgb(51,65,85)", glow: "rgba(148,163,184,0.26)" },
  promotional: { bg: "rgba(52,211,153,0.4)", border: "rgba(16,185,129,0.44)", text: "rgb(6,78,59)", glow: "rgba(16,185,129,0.28)" },
  low_priority: { bg: "rgba(148,163,184,0.3)", border: "rgba(148,163,184,0.34)", text: "rgb(71,85,105)", glow: "rgba(148,163,184,0.2)" },
  top_contacts: { bg: "rgba(196,181,253,0.44)", border: "rgba(167,139,250,0.46)", text: "rgb(76,29,149)", glow: "rgba(167,139,250,0.3)" },
  quiet_contacts: { bg: "rgba(196,181,253,0.28)", border: "rgba(167,139,250,0.32)", text: "rgb(76,29,149)", glow: "rgba(167,139,250,0.18)" },
  unsafe: { bg: "rgba(253,186,116,0.53)", border: "rgba(251,146,60,0.58)", text: "rgb(124,45,18)", glow: "rgba(249,115,22,0.36)" },
};

export default function EmailViewer({
  email,
  onBack,
  profile,
}: {
  email: RelayEmail;
  onBack: () => void;
  profile?: { topSenders: string[]; quietSenders: string[]; trashBiasBySender: Record<string, number> };
}) {
  const fallbackProfile = useMemo(() => ({ topSenders: [], quietSenders: [], trashBiasBySender: {} }), []);
  const p = profile ?? fallbackProfile;
  const sig: EmailSignals = useMemo(() => classifyEmail(email, p), [email, p]);

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

  const badges: { icon: React.ElementType; palette: (typeof PALETTE)[keyof typeof PALETTE] }[] = [];
  if (email.starred) badges.push({ icon: Star, palette: PALETTE.starred });
  if (sig.importanceScore >= 70) badges.push({ icon: Flag, palette: PALETTE.important });
  if (sig.urgentText) badges.push({ icon: BellRing, palette: PALETTE.urgent });
  if (sig.security) badges.push({ icon: Shield, palette: PALETTE.security });
  if (sig.newsletter) badges.push({ icon: Newspaper, palette: PALETTE.newsletters });
  if (sig.promotional) badges.push({ icon: Tag, palette: PALETTE.promotional });
  if (sig.spamLikelihood >= 0.4) badges.push({ icon: TriangleAlert, palette: PALETTE.unsafe });

  return (
    <div className="flex h-full flex-col">
      {/* Viewer header */}
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-neutral-800">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <h1 className="text-lg font-bold text-slate-900 truncate dark:text-neutral-100">
          {email.name ?? email.sender}
        </h1>
        <button
          type="button"
          className="ml-auto shrink-0 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          <Info size={18} />
        </button>
      </header>

      {/* Email body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 pb-48">
        {/* Sender row */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{ backgroundColor: avatarColor(email.sender) }}
          >
            {email.sender.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-slate-900 truncate dark:text-neutral-100">
              {email.name ?? (email.sender.includes("@") ? email.sender.split("@")[0] : email.sender)}
            </div>
            <div className="text-sm text-slate-400 truncate dark:text-neutral-500">
              {email.email ?? email.sender}
            </div>
          </div>
          <span className="shrink-0 text-sm tabular-nums text-slate-400 dark:text-neutral-500">
            {formatListTime(email.receivedAt)}
          </span>
        </div>

        {/* Badges */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {badges.map(({ icon: Icon, palette }) => (
              <span
                key={palette.text}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold"
                style={{
                  backgroundColor: palette.bg,
                  borderColor: palette.border,
                  color: palette.text,
                  boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.78), 0 8px 18px -10px ${palette.glow}`,
                }}
              >
                <Icon size={12} />
              </span>
            ))}
          </div>
        )}

        {/* Subject */}
        <h2 className="text-xl font-bold text-slate-900 mb-3 dark:text-neutral-100">
          {email.subject}
        </h2>

        {/* Body */}
        <div className="text-base leading-relaxed text-slate-700 whitespace-pre-wrap dark:text-neutral-300">
          {email.body}
        </div>
      </div>

      {/* Action bar — fixed at bottom above nav */}
      <div className="fixed bottom-[88px] left-0 right-0 z-40 mx-auto flex max-w-lg items-center justify-center gap-3 px-4 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/60 px-5 py-2 text-sm font-bold text-slate-900 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 active:scale-[0.98] dark:border-neutral-700/60 dark:bg-neutral-800/60 dark:text-neutral-100"
          >
            <Reply size={16} />
            Reply
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/60 px-5 py-2 text-sm font-bold text-slate-900 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 active:scale-[0.98] dark:border-neutral-700/60 dark:bg-neutral-800/60 dark:text-neutral-100"
          >
            <ReplyAll size={16} />
            Reply all
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/60 px-5 py-2 text-sm font-bold text-slate-900 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 active:scale-[0.98] dark:border-neutral-700/60 dark:bg-neutral-800/60 dark:text-neutral-100"
          >
            <Forward size={16} />
            Forward
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/60 px-5 py-2 text-sm font-bold text-rose-600 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 active:scale-[0.98] dark:border-neutral-700/60 dark:bg-neutral-800/60 dark:text-rose-400"
          >
            <Trash2 size={16} />
            Trash
          </button>
      </div>
    </div>
  );
}
