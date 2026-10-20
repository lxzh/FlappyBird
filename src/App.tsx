import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Cloud,
  CloudUpload,
  Copy,
  Crown,
  Expand,
  Feather,
  Gamepad2,
  Globe,
  Link2,
  LoaderCircle,
  Medal,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Radio,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from "lucide-react";
import { clsx } from "clsx";
import { connect, post } from "./api";
import { Bird, birdColors } from "./components/Bird";
import { Button } from "./components/ui/Button";
import { Dialog } from "./components/ui/Dialog";
import { useGameStore, type BirdColor } from "./store";
import { useEngine } from "./game/useEngine";
import type { Leader } from "../shared/game";

const pad = (n: number) => String(n).padStart(2, "0");
const colors = Object.keys(birdColors) as BirdColor[];
const colorNames: Record<BirdColor, string> = {
  gold: "阳光黄",
  coral: "落日橘",
  mint: "薄荷绿",
  blue: "天空蓝",
};
function RankRows({
  rows,
  playerId,
  full = false,
}: {
  rows: Leader[];
  playerId: string;
  full?: boolean;
}) {
  if (!rows.length)
    return (
      <div className="empty-board">
        <div className="empty-trophy">
          <Trophy size={30} strokeWidth={1.4} />
          <Sparkles className="trophy-spark" size={14} />
        </div>
        <strong>首位冠军，虚位以待</strong>
        <p>完成一局，留下你的名字。</p>
        <span>
          下一个纪录，由你创造 <ArrowUpRight size={13} />
        </span>
      </div>
    );
  return (
    <div className="rank-rows">
      {rows.slice(0, full ? 100 : 5).map((player, i) => (
        <div
          key={player.id}
          className={clsx("rank-row", player.id === playerId && "is-me")}
        >
          <span className={clsx("rank-position", i < 3 && `rank-${i + 1}`)}>
            {i === 0 ? <Crown size={17} /> : pad(i + 1)}
          </span>
          <span className={`avatar avatar-${i % 4}`}>
            <Bird color={colors[i % 4]} />
          </span>
          <span className="rank-player">
            <strong>
              {player.name}
              {player.id === playerId && <em>你</em>}
            </strong>
            <small>{player.games} 次飞行</small>
          </span>
          <b className="rank-score">
            {player.score}
            <small>分</small>
          </b>
        </div>
      ))}
    </div>
  );
}
export default function App() {
  const s = useGameStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { start, flap, pause } = useEngine(canvas);
  const [tab, setTab] = useState<"today" | "all">("today");
  const [dialog, setDialog] = useState<
    "profile" | "room" | "leaderboard" | null
  >(null);
  const [name, setName] = useState(s.name);
  const [selectedColor, setSelectedColor] = useState(s.color);
  const [profileError, setProfileError] = useState("");
  const addresses = s.addresses;
  const isPublic = s.mode === "public";
  const [toast, setToast] = useState("");
  const [nav, setNav] = useState("play");
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => connect(), []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const listener = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);
  const leaders = s.snapshot[tab];
  const myRank = leaders.find((p) => p.id === s.playerId);
  const open = (next: typeof dialog) => {
    if (s.phase === "playing") s.set({ phase: "paused" });
    if (next === "profile") {
      setName(s.name);
      setSelectedColor(s.color);
      setProfileError("");
    }
    if (document.fullscreenElement) {
      void document
        .exitFullscreen()
        .then(() => setDialog(next))
        .catch(() => setToast("请先退出全屏再查看"));
    } else setDialog(next);
  };
  const navigate = (target: string) => {
    setNav(target);
    document.getElementById(target)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  };
  const shareUrl = addresses[0] || window.location.origin;
  async function copy(text: string) {
    try {
      if (navigator.clipboard && window.isSecureContext)
        await navigator.clipboard.writeText(text);
      else {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.cssText = "position:fixed;opacity:0;";
        document.body.append(input);
        input.select();
        const ok = document.execCommand("copy");
        input.remove();
        if (!ok) throw new Error();
      }
      setToast(
        isPublic
          ? "邀请链接已复制，发给朋友一起挑战吧"
          : "邀请链接已复制，发给同一局域网的朋友吧",
      );
    } catch {
      setToast("请长按或选中房间地址复制");
    }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (
      !trimmed ||
      [...trimmed].length > 16 ||
      /[\p{Cc}\p{Cf}]/u.test(trimmed)
    ) {
      setProfileError("请输入 1–16 个字符的昵称");
      return;
    }
    s.set({ name: trimmed, color: selectedColor });
    setDialog(null);
    try {
      await post("profile", { playerId: s.playerId, name: trimmed });
      setToast("飞行员档案已更新");
    } catch {
      setToast("已保存到本机，联网后自动同步");
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.current?.requestFullscreen)
        await stage.current.requestFullscreen();
      else setToast("当前浏览器暂不支持全屏");
    } catch {
      setToast("无法进入全屏，请使用浏览器的全屏功能");
    }
  }
  const syncLabel = {
    idle: "成绩自动保存",
    syncing: "正在上传成绩",
    saved: "成绩已同步到排行榜",
    pending: `${s.pending.length} 条成绩等待补传`,
    practice: "离线练习 · 本局不参与排行",
    error: "成绩校验未通过",
  }[s.syncState];
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#play" aria-label="Flappy Bird 首页">
            <span className="brand-icon">
              <Bird />
            </span>
            <span>
              flappy<span className="brand-dot">.</span>
              <small>THE LOCAL ARCADE</small>
            </span>
          </a>
          <nav aria-label="主导航">
            <button
              className={clsx(nav === "play" && "active")}
              onClick={() => navigate("play")}
            >
              <Gamepad2 size={16} />
              开始游戏
            </button>
            <button
              className={clsx(nav === "leaderboard" && "active")}
              onClick={() => {
                setNav("leaderboard");
                open("leaderboard");
              }}
            >
              <Trophy size={16} />
              排行榜
            </button>
            <button
              className={clsx(nav === "guide" && "active")}
              onClick={() => navigate("guide")}
            >
              <CircleHelp size={16} />
              玩法指南
            </button>
          </nav>
          <div className="header-right">
            <span className="network-chip">
              <span className={clsx("status-dot", !s.connected && "offline")} />
              {s.connected
                ? isPublic
                  ? "联机已连接"
                  : "局域网已连接"
                : "正在连接"}
            </span>
            <button
              className="profile-button"
              onClick={() => open("profile")}
              aria-label="编辑飞行员档案"
            >
              <span className="mini-avatar">
                <Bird color={s.color} />
              </span>
              <span>{s.name}</span>
              <Pencil size={13} />
            </button>
          </div>
        </div>
      </header>
      <main className="page-shell" id="play">
        <section className="page-intro">
          <div>
            <div className="eyebrow">
              <span /> LITTLE WINGS. BIG DREAMS.
            </div>
            <h1>
              小小翅膀，
              <span>
                无限可能
                <svg
                  viewBox="0 0 220 12"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M3 8Q100 0 216 7" />
                </svg>
              </span>
              。
            </h1>
            <p>熟悉的像素世界，多一点和朋友较量的乐趣。准备好刷新纪录了吗？</p>
          </div>
          <Button
            variant="outline"
            onClick={() => open("room")}
            className="invite-button"
          >
            <Users size={17} />
            邀请好友
            <ArrowUpRight size={16} />
          </Button>
        </section>
        <div className="arcade-layout">
          <section className="game-section" aria-label="Flappy Bird 游戏">
            <div className="game-frame">
              <div className="game-toolbar">
                <div className="game-toolbar-label">
                  <span className="game-icon">
                    <Gamepad2 size={18} />
                  </span>
                  <strong>自由飞行</strong>
                  <span className="classic-badge">CLASSIC</span>
                </div>
                <div className="toolbar-actions">
                  <span className="game-mode">
                    <span /> 经典模式
                  </span>
                  <span className="toolbar-divider" />
                  <button
                    className="icon-button"
                    aria-label={s.sound ? "关闭音效" : "开启音效"}
                    title={s.sound ? "关闭音效" : "开启音效"}
                    onClick={() => s.set({ sound: !s.sound })}
                  >
                    {s.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={s.phase === "paused" ? "继续游戏" : "暂停游戏"}
                    title="暂停 / 继续 (P)"
                    onClick={pause}
                    disabled={s.phase !== "playing" && s.phase !== "paused"}
                  >
                    {s.phase === "paused" ? (
                      <Play size={17} />
                    ) : (
                      <Pause size={17} />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    aria-label="全屏游戏"
                    title="全屏游戏"
                    onClick={() => void toggleFullscreen()}
                  >
                    <Expand size={17} />
                  </button>
                </div>
              </div>
              <div
                ref={stage}
                className={clsx(
                  "game-stage",
                  s.phase === "over" && "game-ended",
                  fullscreen && "is-fullscreen",
                )}
                role="application"
                aria-label="Flappy Bird，空格或点击振翅，P 暂停"
                onPointerDown={(e) => {
                  if (!(e.target as HTMLElement).closest("button,a")) {
                    e.preventDefault();
                    flap();
                  }
                }}
              >
                <canvas
                  ref={canvas}
                  width="900"
                  height="520"
                  aria-label="像素小鸟飞越水管的游戏场景"
                />
                <div className="game-hud">
                  <div className="hud-best">
                    <Trophy size={16} />
                    <span>
                      BEST <b>{pad(s.best)}</b>
                    </span>
                  </div>
                  {s.phase === "playing" || s.phase === "paused" ? (
                    <span className="live-score" aria-live="polite">
                      {s.score}
                    </span>
                  ) : (
                    <span className="hud-center">
                      <span /> FLAPPY VALLEY
                    </span>
                  )}
                  <div className="hud-weather">
                    <Sun size={18} />
                    <span>好天气，宜起飞</span>
                  </div>
                </div>
                {(s.phase === "ready" || s.phase === "starting") && (
                  <div className="ready-overlay">
                    <span className="ready-tag">THE CLASSIC, REIMAGINED</span>
                    <h2>
                      FLAPPY BIRD<span>↑</span>
                    </h2>
                    <p className="ready-subtitle">一场说飞就飞的小冒险</p>
                    <div className="ready-action">
                      <Button
                        className="play-button"
                        onClick={() => void start()}
                        disabled={s.phase === "starting"}
                      >
                        {s.phase === "starting" ? (
                          <LoaderCircle className="spin" size={19} />
                        ) : (
                          <Play size={18} fill="currentColor" />
                        )}
                        {s.phase === "starting" ? "准备起飞…" : "开始飞行"}
                        <ArrowRight size={18} />
                      </Button>
                      <p>
                        <kbd>SPACE</kbd>
                        <span>或轻点屏幕，振翅高飞</span>
                      </p>
                    </div>
                  </div>
                )}
                {s.phase === "paused" && (
                  <div className="stage-scrim">
                    <div className="result-card pause-card">
                      <span className="result-icon">
                        <Pause size={25} />
                      </span>
                      <div className="eyebrow">TAKE A LITTLE BREATH</div>
                      <h2>歇一歇，再出发。</h2>
                      <p>你的飞行已暂停，准备好了就继续。</p>
                      <Button className="result-main" onClick={pause}>
                        <Play size={17} />
                        继续飞行
                      </Button>
                      <small>也可以按 P 或 Esc 继续</small>
                    </div>
                  </div>
                )}
                {s.phase === "over" && (
                  <div className="stage-scrim">
                    <div className="result-card">
                      <span className="result-icon">
                        <Medal size={26} />
                      </span>
                      <div className="eyebrow">
                        {s.newBest
                          ? "A NEW PERSONAL BEST!"
                          : "EVERY FLIGHT IS A NEW START"}
                      </div>
                      <h2>
                        {s.newBest ? "新纪录，漂亮！" : "差一点，再来一次！"}
                      </h2>
                      <div className="result-scores">
                        <div>
                          <span>本次得分</span>
                          <strong>{pad(s.score)}</strong>
                        </div>
                        <div>
                          <span>
                            个人最佳 <Trophy size={12} />
                          </span>
                          <strong>{pad(s.best)}</strong>
                        </div>
                      </div>
                      <div
                        className={clsx(
                          "sync-result",
                          s.syncState === "error" && "sync-error",
                        )}
                      >
                        {s.syncState === "saved" ? (
                          <Cloud size={14} />
                        ) : s.syncState === "syncing" ? (
                          <LoaderCircle className="spin" size={14} />
                        ) : (
                          <CloudUpload size={14} />
                        )}{" "}
                        {syncLabel}
                      </div>
                      <Button
                        className="result-main"
                        onClick={() => void start()}
                      >
                        <RotateCcw size={17} />
                        再飞一次
                        <ArrowRight size={16} />
                      </Button>
                      <button
                        className="result-secondary"
                        onClick={() => open("leaderboard")}
                      >
                        看看我的排名 <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
                {fullscreen && (
                  <button
                    className="fullscreen-exit"
                    onClick={() => void toggleFullscreen()}
                    aria-label="退出全屏"
                  >
                    <Expand size={18} />
                    退出全屏
                  </button>
                )}
              </div>
              <div className="game-statusbar">
                <span>
                  <span
                    className={clsx("status-dot", !s.connected && "offline")}
                  />
                  {s.connected ? "服务器已连接" : "离线模式"}
                  <span className="statusbar-separator">·</span>
                  {s.connected ? "每一次努力，都有记录" : "联网后自动重试"}
                </span>
                <span>
                  <ShieldCheck size={13} />{" "}
                  {s.pending.length
                    ? `${s.pending.length} 条待同步`
                    : "成绩自动同步"}
                </span>
              </div>
            </div>
            <div className="personal-stats">
              <div>
                <span className="stat-symbol gold">
                  <Trophy size={20} />
                </span>
                <span className="stat-copy">
                  <small>个人最佳</small>
                  <strong>
                    {pad(s.best)}
                    <em>分</em>
                  </strong>
                </span>
              </div>
              <span className="stat-divider" />
              <div>
                <span className="stat-symbol green">
                  <Feather size={20} />
                </span>
                <span className="stat-copy">
                  <small>累计飞行</small>
                  <strong>
                    {pad(s.games)}
                    <em>次</em>
                  </strong>
                </span>
              </div>
              <span className="stat-divider" />
              <div>
                <span className="stat-symbol blue">
                  <Medal size={21} />
                </span>
                <span className="stat-copy">
                  <small>{tab === "today" ? "今日" : "全站"}排名</small>
                  <strong>
                    {myRank ? `#${myRank.rank}` : "—"}
                    <em>{myRank ? "名" : "等待上榜"}</em>
                  </strong>
                </span>
              </div>
              <span className="stats-note">
                <Sparkles size={14} /> 每一分，都是进步
              </span>
            </div>
          </section>
          <aside className="sidebar">
            <section className="leaderboard-card" id="leaderboard">
              <div className="section-heading">
                <div>
                  <span className="heading-icon">
                    <Trophy size={19} />
                  </span>
                  <h2>飞行排行榜</h2>
                </div>
                <span className="live-badge">
                  <span
                    className={clsx("status-dot", !s.connected && "offline")}
                  />
                  {s.connected ? "LIVE" : "重连中"}
                </span>
              </div>
              <p className="section-description">
                {isPublic
                  ? "每 10 秒刷新，看看谁飞得更远。"
                  : "同一片天空，看看谁飞得更远。"}
              </p>
              <div className="tabs" role="tablist" aria-label="排行榜范围">
                <button
                  id="today-tab"
                  role="tab"
                  aria-selected={tab === "today"}
                  aria-controls="board-panel"
                  onClick={() => setTab("today")}
                >
                  今日排行
                </button>
                <button
                  id="all-tab"
                  role="tab"
                  aria-selected={tab === "all"}
                  aria-controls="board-panel"
                  onClick={() => setTab("all")}
                >
                  历史最佳
                </button>
              </div>
              <div className="board-labels">
                <span>飞行员</span>
                <span>最高分</span>
              </div>
              <div
                role="tabpanel"
                id="board-panel"
                aria-labelledby={`${tab}-tab`}
              >
                <RankRows rows={leaders} playerId={s.playerId} />
              </div>
              <div className="your-rank">
                <span className="your-rank-number">
                  {myRank ? pad(myRank.rank) : "—"}
                </span>
                <span className="avatar my-avatar">
                  <Bird color={s.color} />
                </span>
                <span className="your-rank-copy">
                  <strong>
                    {s.name}
                    <em>你</em>
                  </strong>
                  <small>
                    {myRank
                      ? "继续挑战，下一个纪录就是你"
                      : "准备好留下你的第一笔纪录"}
                  </small>
                </span>
                <b>{myRank?.score ?? "—"}</b>
              </div>
              <button className="all-ranks" onClick={() => open("leaderboard")}>
                查看完整排行榜 <ArrowRight size={14} />
              </button>
            </section>
            <section className="room-card">
              <div className="room-card-art" aria-hidden="true">
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
                <Bird color="gold" />
                <Bird color="mint" />
              </div>
              <span className="eyebrow">BETTER TOGETHER</span>
              <h3>快乐，当然要一起。</h3>
              <p>
                {isPublic ? "把链接发给你的朋友，" : "和朋友连接同一 Wi-Fi，"}
                <br />
                在排行榜上一较高下。
              </p>
              <Button variant="outline" onClick={() => open("room")}>
                <Link2 size={15} />
                邀请朋友加入
                <ArrowUpRight size={15} />
              </Button>
              <span className="room-online">
                <Users size={12} />
                {s.connected ? s.snapshot.online : 0} 位飞行员在线<span>·</span>
                无需注册
              </span>
            </section>
          </aside>
        </div>
        <section className="guide-section" id="guide">
          <div className="guide-title">
            <span className="eyebrow">EASY TO PLAY. HARD TO MASTER.</span>
            <h2>
              三步，开启你的飞行之旅 <ArrowDown size={18} />
            </h2>
          </div>
          <div className="guide-cards">
            <article>
              <span className="guide-number">01</span>
              <span className="guide-icon">
                <MousePointer2 size={21} />
              </span>
              <div>
                <h3>轻轻一点，向上飞</h3>
                <p>
                  按空格、点击鼠标或轻触屏幕，
                  <br className="desktop-br" />
                  让小鸟保持飞行。
                </p>
              </div>
              <kbd>SPACE</kbd>
            </article>
            <article>
              <span className="guide-number">02</span>
              <span className="guide-icon">
                <Gamepad2 size={22} />
              </span>
              <div>
                <h3>找准节奏，穿越水管</h3>
                <p>
                  每通过一组水管得 1 分，
                  <br className="desktop-br" />
                  小心，别碰到水管和地面。
                </p>
              </div>
            </article>
            <article>
              <span className="guide-number">03</span>
              <span className="guide-icon">
                <Trophy size={21} />
              </span>
              <div>
                <h3>刷新纪录，挑战好友</h3>
                <p>
                  成绩自动上传至服务器，
                  <br className="desktop-br" />
                  {isPublic
                    ? "和各地的朋友一起争榜。"
                    : "和局域网的朋友实时争榜。"}
                </p>
              </div>
            </article>
          </div>
        </section>
        <footer className="site-footer">
          <span>
            <Bird /> 为每一个不服输的你而造。
          </span>
          <span>
            少一点烦恼，多一点扑腾。
            <Feather size={14} />
          </span>
          <span>
            FLAPPY CLUB <span className="footer-dot">©</span> 2026
          </span>
        </footer>
      </main>
      <Dialog
        open={dialog === "profile"}
        onOpenChange={(v) => !v && setDialog(null)}
        title="你的飞行员档案"
        description="取一个好记的名字，让朋友在排行榜上找到你。"
      >
        <form onSubmit={saveProfile}>
          <label className="field-label" htmlFor="pilot-name">
            飞行员昵称<span>{[...name].length}/16</span>
          </label>
          <input
            id="pilot-name"
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            autoComplete="nickname"
            placeholder="输入你的昵称"
            aria-invalid={!!profileError}
            aria-describedby={profileError ? "profile-error" : undefined}
          />
          {profileError && (
            <p className="field-error" id="profile-error">
              {profileError}
            </p>
          )}
          <label className="field-label color-label">选一位飞行搭档</label>
          <div className="bird-selector">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={colorNames[color]}
                aria-pressed={selectedColor === color}
                className={clsx(selectedColor === color && "selected")}
                onClick={() => setSelectedColor(color)}
              >
                <Bird color={color} />
                <span>{colorNames[color]}</span>
                {selectedColor === color && <Check size={12} />}
              </button>
            ))}
          </div>
          <p className="dialog-note">
            <ShieldCheck size={14} />
            档案保存在当前浏览器，无需注册。
          </p>
          <Button className="dialog-submit" type="submit">
            保存档案
            <Check size={16} />
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={dialog === "room"}
        onOpenChange={(v) => !v && setDialog(null)}
        title="同一片天空，一起玩"
        description={
          isPublic
            ? "把下面的链接发给朋友，随时随地一起挑战。"
            : "让朋友连上同一个 Wi-Fi，再用浏览器打开下面的地址。"
        }
      >
        <div className="room-dialog-illustration">
          <Bird color="gold" />
          <span>＋</span>
          <Bird color="mint" />
          <span>＝</span>
          <Trophy size={34} />
        </div>
        <label className="field-label" htmlFor="room-url">
          {isPublic ? "联机房间地址" : "局域网房间地址"}
          <span>
            <Wifi size={13} />
            {isPublic ? "ONLINE" : "LAN"}
          </span>
        </label>
        <div className="copy-field">
          <input
            id="room-url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
          />
          <Button
            size="icon"
            aria-label="复制房间地址"
            onClick={() => void copy(shareUrl)}
          >
            <Copy size={17} />
          </Button>
        </div>
        {addresses.length > 1 && (
          <div className="address-options">
            其他可用地址：
            {addresses.slice(1).map((address) => (
              <button key={address} onClick={() => void copy(address)}>
                {address}
                <Copy size={11} />
              </button>
            ))}
          </div>
        )}
        <div className="room-details">
          <span>
            <Radio size={15} />
            <strong>{s.snapshot.online}</strong> 位飞行员在线
          </span>
          <span>
            <Globe size={15} />
            实时排行
          </span>
          <span>
            <Cloud size={15} />
            自动保存
          </span>
        </div>
        <p className="dialog-note">
          {isPublic
            ? "无需处于同一网络，完成对局后成绩会自动保存。"
            : "请保持本机服务运行。若好友无法连接，请检查是否处于同一局域网，并允许 Node.js 通过系统防火墙。"}
        </p>
        <Button className="dialog-submit" onClick={() => void copy(shareUrl)}>
          <Share2 size={16} />
          复制邀请链接
        </Button>
      </Dialog>
      <Dialog
        open={dialog === "leaderboard"}
        onOpenChange={(v) => {
          if (!v) {
            setDialog(null);
            setNav("play");
          }
        }}
        title="每一位飞行员，都值得被看见"
        description={`${s.snapshot.totalPlayers} 位飞行员 · ${s.snapshot.totalGames} 次飞行 · 服务器校验每一份纪录`}
      >
        <div className="tabs" role="tablist" aria-label="完整排行榜范围">
          <button
            role="tab"
            aria-selected={tab === "today"}
            onClick={() => setTab("today")}
          >
            今日排行
          </button>
          <button
            role="tab"
            aria-selected={tab === "all"}
            onClick={() => setTab("all")}
          >
            历史最佳
          </button>
        </div>
        <div className="full-board">
          <RankRows rows={leaders} playerId={s.playerId} full />
        </div>
        <p className="dialog-note">
          <Radio size={14} />
          {s.connected ? "实时同步中" : "连接中，暂时显示上次同步的排行"} ·
          显示前 100 位 · 同分按最早完成顺序排名
        </p>
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </>
  );
}
