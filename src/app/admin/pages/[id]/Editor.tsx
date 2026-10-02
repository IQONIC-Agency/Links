"use client";

import { useEffect, useState, useTransition } from "react";
import { PageView } from "@/components/PageView";
import { defaultButtonStyle, type ButtonStyle, type FontKey, type PageConfig } from "@/db/schema";
import { FONTS } from "@/lib/fonts";
import { savePage, type EditorButton, type EditorPayload } from "../../actions";

/** Vercel functions reject request bodies over 4.5 MB, so big phone photos are shrunk in the browser first. */
async function shrinkIfNeeded(file: File): Promise<Blob> {
  const LIMIT = 4 * 1024 * 1024;
  if (file.size <= LIMIT) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 3200 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht verkleinert werden"))), "image/jpeg", 0.9),
  );
}

function ImageInput({ value, onChange, label }: { value?: string; onChange: (url: string | undefined) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", await shrinkIfNeeded(file), file.name);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || `Upload fehlgeschlagen (${res.status})`);
      onChange(json.url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img className="adm-thumb" src={value} alt="" /> : null}
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        {value ? (
          <button type="button" onClick={() => onChange(undefined)}>
            Entfernen
          </button>
        ) : null}
        {busy ? <span className="muted">lädt…</span> : null}
      </div>
      {err ? <div style={{ color: "#c22", marginTop: 4 }}>{err}</div> : null}
    </div>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field" style={{ flex: "0 0 auto" }}>
      <label>{label}</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input type="color" value={value.length === 7 ? value : "#000000"} onChange={(e) => onChange(e.target.value)} />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 90 }} />
      </div>
    </div>
  );
}

type Draft = Omit<EditorPayload, "buttons"> & { buttons: (EditorButton & { key: string })[] };

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

export function Editor({ initial, domains, models }: { initial: EditorPayload; domains: string[]; models: string[] }) {
  const [d, setD] = useState<Draft>(() => ({ ...initial, buttons: initial.buttons.map((b) => ({ ...b, key: b.id ?? newKey() })) }));
  const [countriesText, setCountriesText] = useState(initial.blockedCountries.join(", "));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setD((p) => ({ ...p, [k]: v }));
    setDirty(true);
  }
  function setCfg<K extends keyof PageConfig>(k: K, v: PageConfig[K]) {
    setD((p) => ({ ...p, config: { ...p.config, [k]: v } }));
    setDirty(true);
  }
  function setBtn(i: number, patch: Partial<EditorButton>) {
    setD((p) => ({ ...p, buttons: p.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
    setDirty(true);
  }
  function setBtnStyle(i: number, patch: Partial<ButtonStyle>) {
    setD((p) => ({ ...p, buttons: p.buttons.map((b, j) => (j === i ? { ...b, style: { ...b.style, ...patch } } : b)) }));
    setDirty(true);
  }
  function move(i: number, dir: -1 | 1) {
    setD((p) => {
      const arr = [...p.buttons];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return p;
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      return { ...p, buttons: arr };
    });
    setDirty(true);
  }
  function addButton() {
    const last = d.buttons.at(-1);
    setD((p) => ({
      ...p,
      buttons: [
        ...p.buttons,
        { key: newKey(), id: null, label: "Neuer Link", url: "https://", ageGate: true, deeplink: true, style: { ...(last?.style ?? defaultButtonStyle), imageUrl: undefined } },
      ],
    }));
    setDirty(true);
  }

  function save() {
    setMsg(null);
    const payload: EditorPayload = {
      ...d,
      blockedCountries: countriesText.split(/[\s,;]+/).filter(Boolean),
      buttons: d.buttons.map(({ key: _key, ...b }) => b),
    };
    start(async () => {
      const res = await savePage(payload);
      if (res.ok) {
        // New buttons got their permanent ids on the server.
        setD((p) => ({ ...p, buttons: p.buttons.map((b, i) => ({ ...b, id: res.buttonIds[i] ?? b.id })) }));
        setDirty(false);
        setMsg({ ok: true, text: "Gespeichert." });
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  const publicUrl = `https://${d.domain}/${d.slug}`;

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, flex: 1 }}>
          {d.domain}/{d.slug}
        </h1>
        <a className="btn" href={publicUrl} target="_blank" rel="noreferrer">
          Öffnen
        </a>
        <a className="btn" href={`/admin/stats/${d.id}`}>
          Stats
        </a>
        <button className="primary" onClick={save} disabled={pending}>
          {pending ? "Speichert…" : dirty ? "Speichern *" : "Speichern"}
        </button>
      </div>
      {msg ? (
        <div className="adm-card" style={{ color: msg.ok ? "var(--ok)" : "#c22" }}>
          {msg.text}
        </div>
      ) : null}

      <div className="adm-editor">
        <div>
          <section className="adm-card">
            <h2 style={{ marginTop: 0 }}>Seite</h2>
            <div className="row">
              <div className="field">
                <label>Domain</label>
                <select value={d.domain} onChange={(e) => set("domain", e.target.value)}>
                  {(domains.includes(d.domain) ? domains : [d.domain, ...domains]).map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Slug</label>
                <input type="text" value={d.slug} onChange={(e) => set("slug", e.target.value)} />
              </div>
              <div className="field">
                <label>Model</label>
                <input type="text" list="ed-models" value={d.model} onChange={(e) => set("model", e.target.value)} />
                <datalist id="ed-models">{models.map((x) => <option key={x} value={x} />)}</datalist>
              </div>
            </div>
            <div className="field">
              <label>Notiz (z. B. welcher IG-Account den Link nutzt)</label>
              <textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
            <div>
              <label className="toggle">
                <input type="checkbox" checked={d.live} onChange={(e) => set("live", e.target.checked)} /> Live
              </label>
              <label className="toggle">
                <input type="checkbox" checked={d.deeplinkEnabled} onChange={(e) => set("deeplinkEnabled", e.target.checked)} />
                Deeplink (Absprung aus Instagram/Threads beim Klick)
              </label>
            </div>
          </section>

          <section className="adm-card">
            <h2 style={{ marginTop: 0 }}>Schutz</h2>
            <div className="field">
              <label>Blockierte Länder (ISO-Codes, z. B. DE, AT, CH)</label>
              <input
                type="text"
                value={countriesText}
                onChange={(e) => {
                  setCountriesText(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
            <label className="toggle">
              <input type="checkbox" checked={d.blockVpn} onChange={(e) => set("blockVpn", e.target.checked)} /> VPN/Proxy blocken
              (proxycheck.io)
            </label>
          </section>

          <section className="adm-card">
            <h2 style={{ marginTop: 0 }}>Design</h2>
            <div className="row">
              <div className="field">
                <label>Titel</label>
                <input type="text" value={d.config.title ?? ""} onChange={(e) => setCfg("title", e.target.value)} />
              </div>
              <div className="field">
                <label>Schriftart</label>
                <select value={d.config.font} onChange={(e) => setCfg("font", e.target.value as FontKey)}>
                  {(Object.keys(FONTS) as FontKey[]).map((k) => (
                    <option key={k} value={k}>
                      {FONTS[k].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Untertitel</label>
              <textarea value={d.config.subtitle ?? ""} onChange={(e) => setCfg("subtitle", e.target.value)} />
            </div>
            <ImageInput label="Profilbild" value={d.config.avatarUrl} onChange={(v) => setCfg("avatarUrl", v)} />
            <ImageInput label="Hintergrundbild" value={d.config.backgroundImageUrl} onChange={(v) => setCfg("backgroundImageUrl", v)} />
            <div className="row">
              <Color label="Hintergrundfarbe" value={d.config.backgroundColor} onChange={(v) => setCfg("backgroundColor", v)} />
              <Color label="Textfarbe" value={d.config.textColor} onChange={(v) => setCfg("textColor", v)} />
              <div className="field">
                <label>Abdunklung Hintergrundbild: {Math.round(d.config.backgroundOverlay * 100)} %</label>
                <input
                  type="range"
                  min={0}
                  max={0.9}
                  step={0.05}
                  value={d.config.backgroundOverlay}
                  onChange={(e) => setCfg("backgroundOverlay", Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          </section>

          <section className="adm-card">
            <h2 style={{ marginTop: 0 }}>Buttons</h2>
            {d.buttons.map((b, i) => (
              <div className="adm-btn-item" key={b.key}>
                <div className="adm-btn-head">
                  <strong>
                    {i + 1}. {b.label}
                  </strong>
                  {b.id ? <span className="muted">/r/{b.id}</span> : <span className="muted">neu</span>}
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === d.buttons.length - 1}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (!window.confirm(`Button „${b.label}“ entfernen?`)) return;
                      setD((p) => ({ ...p, buttons: p.buttons.filter((_, j) => j !== i) }));
                      setDirty(true);
                    }}
                  >
                    Entfernen
                  </button>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Text</label>
                    <input type="text" value={b.label} onChange={(e) => setBtn(i, { label: e.target.value })} />
                  </div>
                  <div className="field" style={{ flexBasis: 280 }}>
                    <label>Ziel-URL (wird maskiert, steht nicht im HTML)</label>
                    <input type="url" value={b.url} onChange={(e) => setBtn(i, { url: e.target.value })} />
                  </div>
                </div>
                <div className="row">
                  <Color label="Farbe" value={b.style.bgColor} onChange={(v) => setBtnStyle(i, { bgColor: v })} />
                  <Color label="Textfarbe" value={b.style.textColor} onChange={(v) => setBtnStyle(i, { textColor: v })} />
                  <Color label="Rahmenfarbe" value={b.style.borderColor} onChange={(v) => setBtnStyle(i, { borderColor: v })} />
                  <div className="field" style={{ flex: "0 0 90px" }}>
                    <label>Rahmen px</label>
                    <input
                      type="number"
                      min={0}
                      max={8}
                      value={b.style.borderWidth}
                      onChange={(e) => setBtnStyle(i, { borderWidth: Number(e.target.value) })}
                    />
                  </div>
                  <div className="field" style={{ flex: "0 0 90px" }}>
                    <label>Rundung px</label>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={b.style.radius}
                      onChange={(e) => setBtnStyle(i, { radius: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <ImageInput label="Bild im Button" value={b.style.imageUrl} onChange={(v) => setBtnStyle(i, { imageUrl: v })} />
                <label className="toggle">
                  <input type="checkbox" checked={b.ageGate} onChange={(e) => setBtn(i, { ageGate: e.target.checked })} /> 18+ Age-Gate
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={b.deeplink} onChange={(e) => setBtn(i, { deeplink: e.target.checked })} /> Deeplink
                  aus In-App-Browser
                </label>
              </div>
            ))}
            <button type="button" onClick={addButton}>
              + Button
            </button>
          </section>
        </div>

        <div className="adm-phone">
          <PageView
            preview
            pageId={d.id}
            config={d.config}
            deeplinkEnabled={false}
            buttons={d.buttons.map((b) => ({ id: b.id ?? b.key, label: b.label, style: b.style, deeplink: false }))}
          />
        </div>
      </div>
    </>
  );
}
