import { useState, useCallback, useRef } from "react";
import { Video2Ascii } from "./video2ascii";
import type { AsciiRenderer } from "./video2ascii";
import "./App.css";

const DEMO_VIDEO = "/demo.mp4";

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
  const handleClick = () => {
    const text = getText();
    if (!text) return;
    navigator.clipboard.writeText(text);
  };

  return (
    <button className="copy-icon" onClick={handleClick}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6.35 6.35" width="15" height="15">
        <path fill="currentColor" d="M2.43.265c-.3 0-.548.236-.573.53h-.328a.74.74 0 0 0-.735.734v3.822a.74.74 0 0 0 .735.734H4.82a.74.74 0 0 0 .735-.734V1.529a.74.74 0 0 0-.735-.735h-.328a.58.58 0 0 0-.573-.53zm0 .529h1.49c.032 0 .049.017.049.049v.431c0 .032-.017.049-.049.049H2.43c-.032 0-.05-.017-.05-.049V.843c0-.032.018-.05.05-.05zm-.901.53h.328c.026.292.274.528.573.528h1.49a.58.58 0 0 0 .573-.529h.328a.2.2 0 0 1 .206.206v3.822a.2.2 0 0 1-.206.205H1.53a.2.2 0 0 1-.206-.205V1.529a.2.2 0 0 1 .206-.206z" />
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

function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("video.mp4");
  const [isDragging, setIsDragging] = useState(false);
  const rendererRef = useRef<AsciiRenderer | null>(null);

  const processFile = async (file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFileName(file.name);

    if (file.type.startsWith("image/")) {
      setVideoUrl(await imageToWebm(file));
    } else if (file.type.startsWith("video/")) {
      setVideoUrl(URL.createObjectURL(file));
    }
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
              numColumns={80}
              charset="code"
              highlight={30}
              brightness={2.0}
              trailLength={18}
            />
          </div>
          <div className="landing-info">
            <h1 className="landing-title">video to ascii</h1>
            <p className="landing-subtitle">
              recreating <a href="https://www.generalintuition.com/" target="_blank" rel="noopener noreferrer" className="gi-link">general intuition</a> ascii art
            </p>
            <div className="landing-description">
              <p>
                a webgl-powered ascii renderer that converts any video into
                real-time character art. upload a video or image, get a live
                ascii version with cursor-reactive glow and trail effects.
              </p>
              <p>
                each pixel's brightness is mapped to a character in real time,
                all hardware-accelerated. ships as a standalone library you can
                drop into any site.
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
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="player-page">
        <div className="player-frame">
          <Video2Ascii
            src={videoUrl}
            numColumns={90}
            charset="code"
            highlight={30}
            brightness={2.0}
            trailLength={18}
            onRenderer={(r) => { rendererRef.current = r; }}
          />
        </div>

        <div className="action-bar">
          <CopyButton getText={() => rendererRef.current?.captureText() ?? ""} />
        </div>

        <div className="code-section">
          <h2 className="code-section-title">use it on your site</h2>
          <p className="code-section-note">
            build the library with <code>npm run build:lib</code> to
            get <code>ascii-renderer.umd.js</code> and <code>ascii-renderer.es.js</code>,
            then include one of them alongside your video file.
          </p>
          <CodeBlock label="Script Tag (UMD)" code={snippet("umd", fileName)} />
          <CodeBlock label="ES Module" code={snippet("esm", fileName)} />
        </div>
      </main>
    </div>
  );
}

export default App;
