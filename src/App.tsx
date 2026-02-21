import { useState, useCallback, useRef } from "react";
import { Video2Ascii } from "./video2ascii";
import type { AsciiRenderer } from "./video2ascii";
import "./App.css";

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

function useCopyFeedback(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return [copied, copy];
}

function snippet(type: "umd" | "esm", filename: string): string {
  const opts = `  videoSrc: '${filename}',\n  columns: 90,\n  colored: true,\n  enableMouse: true,`;
  if (type === "umd") {
    return `<div id="ascii"></div>\n<script src="ascii-renderer.umd.js"></script>\n<script>\n  new AsciiRenderer('#ascii', {\n${opts}\n  });\n</script>`;
  }
  return `import { AsciiRenderer } from './ascii-renderer.es.js';\n\nnew AsciiRenderer('#ascii', {\n${opts}\n});`;
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, copy] = useCopyFeedback();
  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-label">{label}</span>
        <button className="copy-btn" onClick={() => copy(code)}>
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="code-pre"><code>{code}</code></pre>
    </div>
  );
}

function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("video.mp4");
  const [isDragging, setIsDragging] = useState(false);
  const [asciiCopied, copyAscii] = useCopyFeedback();
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
        <main className="hero">
          <div className="title-area">
            <h1>video to ascii</h1>
            <p className="subtitle">recreating general intuition ascii art</p>
          </div>
          <div
            className={`glass-panel${isDragging ? " drag-over" : ""}`}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
          />
          <label className="generate-btn">
            generate
            <input
              type="file"
              accept="video/*,image/*"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
            />
          </label>
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
          <button
            className="action-btn"
            onClick={() => {
              const text = rendererRef.current?.captureText();
              if (text) copyAscii(text);
            }}
          >
            {asciiCopied ? "copied" : "copy ascii frame"}
          </button>
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
