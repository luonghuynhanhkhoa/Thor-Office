"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

/**
 * THỜI GIAN THỰC (chỉ trình duyệt): dùng kênh Broadcast/Presence của Supabase (cùng dự án Thor) để
 *  1) chọc / đấm / gửi icon giữa những người đang mở văn phòng,
 *  2) gọi audio/video trong phòng họp (WebRTC nối thẳng giữa các máy; Supabase chỉ chuyển tín hiệu bắt tay).
 * Tên kênh có mã ngẫu nhiên đổi mỗi ngày, chỉ người đã đăng nhập mới biết (kênh Supabase là kênh công khai).
 */
export type RtConfig = { url: string; key: string; ns: string };

let shared: { cfgKey: string; client: SupabaseClient } | null = null;
function clientFor(cfg: RtConfig): SupabaseClient {
  const k = `${cfg.url}|${cfg.ns}`;
  if (!shared || shared.cfgKey !== k) {
    shared = {
      cfgKey: k,
      client: createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 20 } } }),
    };
  }
  return shared.client;
}

// ------------------------------------------------------------------ chọc / đấm / icon
export type FxKind = "poke" | "punch" | "tongue" | "laugh" | "heart";
export type FxEvent = { id: string; kind: FxKind; fromName: string; toId: string; toName: string; t: number };

export const FX_INFO: Record<FxKind, { emoji: string; label: string; verb: string }> = {
  poke: { emoji: "👉", label: "Chọc", verb: "chọc" },
  punch: { emoji: "👊", label: "Đấm", verb: "đấm" },
  tongue: { emoji: "😝", label: "Lêu lêu", verb: "lêu lêu" },
  laugh: { emoji: "😄", label: "Cười", verb: "cười với" },
  heart: { emoji: "❤️", label: "Thả tim", verb: "thả tim cho" },
};

export function openFxChannel(cfg: RtConfig, onFx: (e: FxEvent) => void): { send: (kind: FxKind, fromName: string, toId: string, toName: string) => void; close: () => void } {
  const sb = clientFor(cfg);
  const ch = sb.channel(`fx:${cfg.ns}`, { config: { broadcast: { self: true } } });
  ch.on("broadcast", { event: "fx" }, ({ payload }) => {
    const p = payload as FxEvent;
    if (p && p.kind in FX_INFO && typeof p.toId === "string") onFx({ ...p, t: Date.now() });
  }).subscribe();
  return {
    send: (kind, fromName, toId, toName) => {
      void ch.send({ type: "broadcast", event: "fx", payload: { id: Math.random().toString(36).slice(2, 10), kind, fromName: fromName.slice(0, 40), toId, toName: toName.slice(0, 40) } });
    },
    close: () => {
      void sb.removeChannel(ch);
    },
  };
}

// ------------------------------------------------------------------ gọi họp (WebRTC nhiều người, nối thẳng giữa các máy)
export type MeetPeer = { id: string; name: string; stream: MediaStream | null; state: string };
export type MeetState = {
  joined: boolean;
  joining: boolean;
  error: string | null;
  note: string | null;
  local: MediaStream | null;
  peers: MeetPeer[];
  members: { id: string; name: string }[];
  mic: boolean;
  cam: boolean;
};

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

type Sig = { from: string; to: string; kind: "offer" | "answer" | "ice"; data: unknown };

export class MeetingCall {
  private cfg: RtConfig;
  private me: { id: string; name: string };
  private sb: SupabaseClient;
  private ch: RealtimeChannel | null = null;
  private pcs = new Map<string, RTCPeerConnection>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private streams = new Map<string, MediaStream>();
  private names = new Map<string, string>();
  private listeners = new Set<() => void>();
  private snap: MeetState = { joined: false, joining: false, error: null, note: null, local: null, peers: [], members: [], mic: true, cam: true };

  constructor(cfg: RtConfig, me: { id: string; name: string }) {
    this.cfg = cfg;
    this.me = me;
    this.sb = clientFor(cfg);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<MeetState>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }
  private refreshPeers() {
    const peers: MeetPeer[] = [...this.pcs.entries()].map(([id, pc]) => ({ id, name: this.names.get(id) ?? "?", stream: this.streams.get(id) ?? null, state: pc.connectionState }));
    this.set({ peers });
  }

  async join() {
    if (this.snap.joined || this.snap.joining) return;
    this.set({ joining: true, error: null, note: null });
    let local: MediaStream | null = null;
    let note: string | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt không hỗ trợ micro/camera (cần https).");
      local = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 360 } });
    } catch {
      try {
        local = await navigator.mediaDevices.getUserMedia({ audio: true });
        note = "Không bật được camera — chỉ gọi tiếng.";
      } catch {
        note = "Không có micro/camera (hoặc anh chưa cho phép) — chỉ xem/nghe người khác.";
      }
    }
    const ch = this.sb.channel(`meet:${this.cfg.ns}`, { config: { broadcast: { self: false }, presence: { key: this.me.id } } });
    this.ch = ch;
    ch.on("broadcast", { event: "sig" }, ({ payload }) => void this.onSignal(payload as Sig));
    ch.on("presence", { event: "sync" }, () => this.onPresence());
    ch.on("presence", { event: "leave" }, ({ key }) => key && this.drop(String(key)));
    await new Promise<void>((resolve) => {
      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ name: this.me.name });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.set({ error: "Không nối được kênh gọi họp." });
          resolve();
        }
      });
    });
    this.set({ joined: true, joining: false, local, note, mic: true, cam: !!local?.getVideoTracks().length });
    this.onPresence();
  }

  private onPresence() {
    const ch = this.ch;
    if (!ch) return;
    const state = ch.presenceState() as Record<string, { name?: string }[]>;
    const members = Object.entries(state).map(([id, v]) => ({ id, name: v[0]?.name ?? "?" }));
    for (const m of members) this.names.set(m.id, m.name);
    this.set({ members });
    for (const m of members) {
      if (m.id === this.me.id || this.pcs.has(m.id)) continue;
      // người có mã nhỏ hơn là bên chào trước (tránh hai bên cùng chào)
      if (this.me.id < m.id) void this.connect(m.id, true);
    }
    for (const id of [...this.pcs.keys()]) if (!members.some((m) => m.id === id)) this.drop(id);
  }

  private makePeer(id: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE);
    this.pcs.set(id, pc);
    const local = this.snap.local;
    if (local && local.getTracks().length) for (const t of local.getTracks()) pc.addTrack(t, local);
    else {
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });
    }
    pc.ontrack = (e) => {
      this.streams.set(id, e.streams[0] ?? new MediaStream([e.track]));
      this.refreshPeers();
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ from: this.me.id, to: id, kind: "ice", data: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => this.refreshPeers();
    this.refreshPeers();
    return pc;
  }

  private async connect(id: string, initiator: boolean) {
    const pc = this.pcs.get(id) ?? this.makePeer(id);
    if (!initiator) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ from: this.me.id, to: id, kind: "offer", data: offer });
  }

  private send(s: Sig) {
    void this.ch?.send({ type: "broadcast", event: "sig", payload: s });
  }

  private async onSignal(s: Sig) {
    if (!s || s.to !== this.me.id || s.from === this.me.id) return;
    let pc = this.pcs.get(s.from);
    if (s.kind === "offer") {
      pc = pc ?? this.makePeer(s.from);
      await pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ from: this.me.id, to: s.from, kind: "answer", data: answer });
      await this.flushIce(s.from);
    } else if (s.kind === "answer" && pc) {
      await pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
      await this.flushIce(s.from);
    } else if (s.kind === "ice") {
      const cand = s.data as RTCIceCandidateInit;
      if (pc?.remoteDescription) await pc.addIceCandidate(cand).catch(() => undefined);
      else this.pendingIce.set(s.from, [...(this.pendingIce.get(s.from) ?? []), cand]);
    }
  }

  private async flushIce(id: string) {
    const pc = this.pcs.get(id);
    const q = this.pendingIce.get(id) ?? [];
    this.pendingIce.delete(id);
    for (const c of q) await pc?.addIceCandidate(c).catch(() => undefined);
  }

  private drop(id: string) {
    this.pcs.get(id)?.close();
    this.pcs.delete(id);
    this.streams.delete(id);
    this.pendingIce.delete(id);
    this.refreshPeers();
  }

  toggleMic() {
    const on = !this.snap.mic;
    this.snap.local?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.set({ mic: on });
  }
  toggleCam() {
    const on = !this.snap.cam;
    this.snap.local?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.set({ cam: on });
  }

  leave() {
    for (const id of [...this.pcs.keys()]) this.drop(id);
    this.snap.local?.getTracks().forEach((t) => t.stop());
    if (this.ch) void this.sb.removeChannel(this.ch);
    this.ch = null;
    this.set({ joined: false, joining: false, local: null, peers: [], members: [], note: null, error: null });
  }
}

// ------------------------------------------------------------------ ai đang trực tuyến + trang phục (Presence)
import type { CostumeId } from "@/lib/costumes";
import { asCostume } from "@/lib/costumes";

export type OfficeMember = { uid: string; name: string; staffIds: string[]; costume: CostumeId; boss: boolean };

/** Trạng thái một nhân vật gửi qua mạng: [x, z, hướng, chế độ(0 ngồi bàn·1 đi·2 đứng/ngồi tại chỗ), tư thế, ngồi?]. */
export type Snap = [number, number, number, 0 | 1 | 2, string | null, 0 | 1];
/** Một gói "thế giới": máy CHỦ chạy mô phỏng và gửi vị trí mọi nhân vật; các máy còn lại chỉ nhận và đi theo → ai cũng thấy y hệt nhau. */
export type WorldMsg = { k: string; t: number; full: boolean; a: Record<string, Snap>; ba?: string };

/**
 * Báo "tôi đang trực tuyến + mặc đồ gì" cho mọi người; nhận danh sách người đang trực tuyến. Trang phục của mỗi người hiện ở nhân vật của họ trên máy của tất cả.
 * Cùng kênh này còn chọn ra 1 máy CHỦ (vào sớm nhất, ưu tiên tab đang mở) + truyền/nhận gói "thế giới" (vị trí các nhân vật).
 */
export function openPresence(
  cfg: RtConfig,
  me: OfficeMember & { key: string },
  onSync: (members: OfficeMember[], hostKey: string | null, peerCount: number) => void,
  onWorld: (msg: WorldMsg) => void
): { setCostume: (c: CostumeId) => void; sendWorld: (msg: WorldMsg) => void; close: () => void } {
  const sb = clientFor(cfg);
  const ch = sb.channel(`office:${cfg.ns}`, { config: { presence: { key: me.key } } });
  let current = me.costume;
  let subscribed = false;
  const since = Date.now();
  const seen = () => (typeof document === "undefined" ? true : document.visibilityState !== "hidden");
  let vis = seen();
  const payload = () => ({ uid: me.uid, name: me.name, staffIds: me.staffIds, costume: current, boss: me.boss, since, vis });
  const onVis = () => {
    const v = seen();
    if (v === vis) return;
    vis = v;
    if (subscribed) void ch.track(payload());
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
  ch.on("broadcast", { event: "world" }, (m) => {
    const p = m.payload as WorldMsg | undefined;
    if (p && typeof p.k === "string" && p.a && typeof p.a === "object") onWorld(p);
  });
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState() as Record<string, (Partial<OfficeMember> & { since?: number; vis?: boolean })[]>;
    const byUid = new Map<string, OfficeMember>();
    const cand: { key: string; since: number; vis: boolean }[] = [];
    for (const [key, list] of Object.entries(state)) {
      const m = list[list.length - 1];
      if (!m?.uid || typeof m.name !== "string") continue;
      cand.push({ key, since: typeof m.since === "number" ? m.since : 0, vis: m.vis !== false });
      byUid.set(m.uid, {
        uid: m.uid,
        name: m.name.slice(0, 40),
        staffIds: Array.isArray(m.staffIds) ? m.staffIds.filter((x) => typeof x === "string") : [],
        costume: asCostume(m.costume),
        boss: !!m.boss,
      });
    }
    // máy chủ = người vào sớm nhất; tab bị ẩn (trình duyệt dừng vẽ) thì nhường cho người đang xem
    const pool = cand.some((c) => c.vis) ? cand.filter((c) => c.vis) : cand;
    pool.sort((a, b) => a.since - b.since || (a.key < b.key ? -1 : 1));
    onSync([...byUid.values()], pool[0]?.key ?? null, cand.length);
  });
  ch.subscribe(async (status) => {
    subscribed = status === "SUBSCRIBED";
    if (subscribed) await ch.track(payload());
  });
  return {
    setCostume: (c) => {
      current = c;
      if (subscribed) void ch.track(payload());
    },
    sendWorld: (msg) => {
      if (subscribed) void ch.send({ type: "broadcast", event: "world", payload: msg });
    },
    close: () => {
      subscribed = false;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
      void sb.removeChannel(ch);
    },
  };
}


// ------------------------------------------------------------------ chat thế giới / chat riêng
import type { ChatChannels, ChatMsg } from "@/lib/chat";
import { CHAT_EVENT } from "@/lib/chat";

/** Nghe các kênh chat của mình (thế giới + hộp thư riêng + giám sát nếu là Admin). Tin do MÁY CHỦ gửi (đã đóng dấu người gửi). */
export function openChat(cfg: RtConfig, ch: ChatChannels, onMsg: (m: ChatMsg) => void): { close: () => void } {
  const sb = clientFor(cfg);
  const names = [...new Set([ch.world, ch.inbox, ch.admin].filter((x): x is string => !!x))];
  const chans: RealtimeChannel[] = names.map((n) =>
    sb
      .channel(n)
      .on("broadcast", { event: CHAT_EVENT }, ({ payload }) => {
        const p = payload as Partial<ChatMsg> | undefined;
        if (p && typeof p.id === "string" && typeof p.text === "string" && p.from && typeof p.from.uid === "string" && typeof p.from.name === "string") {
          onMsg({
            id: p.id,
            t: typeof p.t === "number" ? p.t : Date.now(),
            world: !!p.world,
            from: { uid: p.from.uid, name: p.from.name.slice(0, 40) },
            to: p.to && typeof p.to.uid === "string" ? { uid: p.to.uid, name: String(p.to.name ?? "?").slice(0, 40) } : undefined,
            text: p.text.slice(0, 400),
          });
        }
      })
      .subscribe()
  );
  return {
    close: () => {
      for (const c of chans) void sb.removeChannel(c);
    },
  };
}
