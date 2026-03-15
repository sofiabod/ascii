import { useState, useCallback, useRef, useEffect } from "react";
import { Video2Ascii } from "./video2ascii";
import type { AsciiRenderer } from "./video2ascii";
import "./App.css";

const DEMO_VIDEO = "/samples/v3.mp4";
const HISTORY_KEY = "ascii-history";
const ACTIVE_KEY = "ascii-active";
const MAX_HISTORY = 20;
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

interface HistoryEntry {
  id: string;
  name: string;
  type: "sample" | "upload";
  sampleUrl: string | null;
  createdAt: number;
}

// IndexedDB helpers

let cachedDb: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (cachedDb) return Promise.resolve(cachedDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ascii-db", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("videos", { keyPath: "id" });
    };
    req.onsuccess = () => {
      cachedDb = req.result;
      cachedDb.onclose = () => { cachedDb = null; };
      resolve(cachedDb);
    };
    req.onerror = () => reject(req.error);
  });
}

function saveBlob(id: string, blob: Blob): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("videos", "readwrite");
        tx.objectStore("videos").put({ id, blob });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function loadBlob(id: string): Promise<Blob | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("videos", "readonly");
        const req = tx.objectStore("videos").get(id);
        req.onsuccess = () => resolve(req.result?.blob ?? null);
        req.onerror = () => reject(req.error);
      })
  );
}

function deleteBlob(id: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("videos", "readwrite");
        tx.objectStore("videos").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function clearBlobs(): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("videos", "readwrite");
        tx.objectStore("videos").clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full or unavailable — drop oldest entries and retry
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 5)));
    } catch {
      // still failing — give up silently
    }
  }
}

function addHistoryEntry(entry: HistoryEntry, prev: HistoryEntry[]): HistoryEntry[] {
  const filtered = prev.filter((e) => e.id !== entry.id);
  return [entry, ...filtered].slice(0, MAX_HISTORY);
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function imageToWebm(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);

      const recorder = new MediaRecorder(
        canvas.captureStream(1),
        { mimeType: "video/webm" }
      );
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => resolve(URL.createObjectURL(new Blob(chunks, { type: "video/webm" })));
      recorder.onerror = () => reject(new Error("MediaRecorder failed"));
      recorder.start();
      setTimeout(() => recorder.stop(), 500);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

function snippet(type: "umd" | "esm", filename: string): string {
  const opts = `  videoSrc: '${filename}',\n  columns: 90,\n  colored: true,\n  enableMouse: true,`;
  if (type === "umd") {
    return `<div id="ascii"></div>\n<script src="ascii-renderer.umd.js"></script>\n<script>\n  new AsciiRenderer('#ascii', {\n${opts}\n  });\n</script>`;
  }
  return `import { AsciiRenderer } from './ascii-renderer.es.js';\n\nnew AsciiRenderer('#ascii', {\n${opts}\n});`;
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    const text = getText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button className="copy-icon" onClick={handleClick}>
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6.35 6.35" width="15" height="15">
          <path fill="currentColor" d="M2.43.265c-.3 0-.548.236-.573.53h-.328a.74.74 0 0 0-.735.734v3.822a.74.74 0 0 0 .735.734H4.82a.74.74 0 0 0 .735-.734V1.529a.74.74 0 0 0-.735-.735h-.328a.58.58 0 0 0-.573-.53zm0 .529h1.49c.032 0 .049.017.049.049v.431c0 .032-.017.049-.049.049H2.43c-.032 0-.05-.017-.05-.049V.843c0-.032.018-.05.05-.05zm-.901.53h.328c.026.292.274.528.573.528h1.49a.58.58 0 0 0 .573-.529h.328a.2.2 0 0 1 .206.206v3.822a.2.2 0 0 1-.206.205H1.53a.2.2 0 0 1-.206-.205V1.529a.2.2 0 0 1 .206-.206z" />
        </svg>
      )}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="back-btn" onClick={onClick} aria-label="Back">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-label">{label}</span>
        <CopyButton getText={() => code} />
      </div>
      <pre className="code-pre"><code>{code}</code></pre>
    </div>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      Made with 🤍 by <a href="https://sofiabodnar.com/" target="_blank" rel="noopener noreferrer">Sofia Bodnar</a>
    </footer>
  );
}

function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("video.mp4");
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const rendererRef = useRef<AsciiRenderer | null>(null);

  // restore active video on mount (survives refresh)
  useEffect(() => {
    const activeId = sessionStorage.getItem(ACTIVE_KEY);
    if (!activeId) return;
    const entry = loadHistory().find((e) => e.id === activeId);
    if (!entry) { sessionStorage.removeItem(ACTIVE_KEY); return; }
    if (entry.type === "sample" && entry.sampleUrl) {
      setVideoUrl(entry.sampleUrl);
      setFileName(entry.name + ".mp4");
    } else {
      loadBlob(entry.id).then((blob) => {
        if (blob) {
          setVideoUrl(URL.createObjectURL(blob));
          setFileName(entry.name);
        } else {
          sessionStorage.removeItem(ACTIVE_KEY);
        }
      }).catch(() => {
        sessionStorage.removeItem(ACTIVE_KEY);
      });
    }
  }, []);

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((prev) => {
      const next = addHistoryEntry(entry, prev);
      saveHistory(next);
      return next;
    });
  };

  const processFile = async (file: File) => {
    if (isProcessing) return;
    setError(null);

    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Max is 500 MB.`);
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("Unsupported file type. Please upload a video or image.");
      return;
    }

    setIsProcessing(true);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFileName(file.name);

    const id = crypto.randomUUID();

    try {
      if (file.type.startsWith("image/")) {
        const url = await imageToWebm(file);
        setVideoUrl(url);
      } else {
        setVideoUrl(URL.createObjectURL(file));
      }
      await saveBlob(id, file).catch(() => {});
      sessionStorage.setItem(ACTIVE_KEY, id);
      pushHistory({ id, name: file.name, type: "upload", sampleUrl: null, createdAt: Date.now() });
    } catch {
      setError("Failed to process file. The format may not be supported by your browser.");
    } finally {
      setIsProcessing(false);
    }
  };

  const openSample = (url: string) => {
    const name = url.split("/").pop()?.replace(".mp4", "") ?? url;
    setVideoUrl(url);
    setFileName(name + ".mp4");
    sessionStorage.setItem(ACTIVE_KEY, url);
    pushHistory({ id: url, name, type: "sample", sampleUrl: url, createdAt: Date.now() });
  };

  const openHistoryEntry = async (entry: HistoryEntry) => {
    if (entry.type === "sample" && entry.sampleUrl) {
      setVideoUrl(entry.sampleUrl);
      setFileName(entry.name + ".mp4");
      sessionStorage.setItem(ACTIVE_KEY, entry.id);
      return;
    }
    try {
      const blob = await loadBlob(entry.id);
      if (!blob) {
        removeHistoryEntry(entry.id);
        return;
      }
      if (videoUrl && videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(blob));
      setFileName(entry.name);
      sessionStorage.setItem(ACTIVE_KEY, entry.id);
    } catch {
      removeHistoryEntry(entry.id);
    }
  };

  const removeHistoryEntry = (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveHistory(next);
      return next;
    });
    deleteBlob(id);
  };

  const clearAllHistory = () => {
    setHistory([]);
    saveHistory([]);
    clearBlobs();
  };

  const goBack = () => {
    if (videoUrl && videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    rendererRef.current = null;
    sessionStorage.removeItem(ACTIVE_KEY);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [videoUrl]);

  if (!videoUrl) {
    return (
      <div className="app">
        <main className="landing">
          <div className="landing-demo">
            <Video2Ascii
              src={DEMO_VIDEO}
              numColumns={90}
              charset="code"
              highlight={30}
              brightness={2.0}
              trailLength={5}
            />
          </div>
          <div className="landing-info">
            <h1 className="landing-title">video to ascii</h1>
            <p className="landing-subtitle">
              recreating <a href="https://www.generalintuition.com/" target="_blank" rel="noopener noreferrer" className="gi-link">general intuition</a> ascii art
            </p>
            <div className="landing-description">
              <p>
                converts videos into ascii art using webgl.
                divides each frame into a grid of cells, maps cell
                brightness to characters, and renders them in real time
                with cursor glow and trail effects.
              </p>
            </div>
            <div
              className={`drop-zone${isDragging ? " drag-over" : ""}`}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
            >
              <label className="generate-btn">
                <span className="edge-left" />
                <span className="edge-right" />
                generate
                <input
                  type="file"
                  accept="video/*,image/*"
                  hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                />
              </label>
              <span className="drop-hint">or drop a file here</span>
            </div>
            {error && <p className="upload-error">{error}</p>}
            <div className="samples">
              <span className="samples-label">or try a sample</span>
              <div className="samples-grid">
                <button className="sample-card" onClick={() => openSample("/samples/v1.mp4")}>
                  <div className="sample-thumb sample-thumb-placeholder">
                    <video src="/samples/v1.mp4" muted playsInline loop autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.6)" }} />
                  </div>
                  <span className="sample-name">v1</span>
                </button>
                <button className="sample-card" onClick={() => openSample("/samples/v2.mp4")}>
                  <div className="sample-thumb sample-thumb-placeholder">
                    <video src="/samples/v2.mp4" muted playsInline loop autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.6)" }} />
                  </div>
                  <span className="sample-name">v2</span>
                </button>
                <button className="sample-card" onClick={() => openSample("/samples/v3.mp4")}>
                  <div className="sample-thumb sample-thumb-placeholder">
                    <video src="/samples/v3.mp4" muted playsInline loop autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.6)" }} />
                  </div>
                  <span className="sample-name">v3</span>
                </button>
              </div>
            </div>
            {history.length > 0 && (
              <div className="history">
                <div className="history-header">
                  <span className="history-label">history</span>
                  <button className="history-clear" onClick={clearAllHistory}>clear</button>
                </div>
                <div className="history-list">
                  {history.map((entry) => (
                    <div className="history-row" key={entry.id}>
                      <button className="history-name" onClick={() => openHistoryEntry(entry)}>
                        {entry.name}
                      </button>
                      <span className="history-time">{relativeTime(entry.createdAt)}</span>
                      <button className="history-remove" onClick={() => removeHistoryEntry(entry.id)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app">
      <main className="player-page">
        <div className="player-left">
          <nav className="player-nav">
            <BackButton onClick={goBack} />
          </nav>
          <div className="player-frame">
            <Video2Ascii
              src={videoUrl}
              numColumns={90}
              charset="code"
              highlight={30}
              brightness={2.0}
              trailLength={5}
              onRenderer={(r) => { rendererRef.current = r; }}
              onError={(msg) => { setError(msg); goBack(); }}
            />
          </div>
          <div className="action-bar">
            <CopyButton getText={() => rendererRef.current?.captureText() ?? ""} />
          </div>
        </div>
        <div className="player-right">
          <div className="code-section">
            <h2 className="code-section-title">use it on your site</h2>
            <p className="code-section-note">
              build the library with <code>npm run build:lib</code> to
              get <code>ascii-renderer.umd.js</code> and <code>ascii-renderer.es.js</code>,
              then include one of them alongside your video file.
              the video must be served from your site, local file paths won't work.
            </p>
            <CodeBlock label="Script Tag (UMD)" code={snippet("umd", fileName)} />
            <CodeBlock label="ES Module" code={snippet("esm", fileName)} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default App;
