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
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const stream = canvas.captureStream(1);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        resolve(URL.createObjectURL(blob));
      };

      recorder.onerror = () => reject(new Error("MediaRecorder failed"));

      recorder.start();
      setTimeout(() => recorder.stop(), 500);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

function makeSnippetUMD(filename: string) {
  return `<div id="ascii"></div>
<script src="ascii-renderer.umd.js"></script>
<script>
  new AsciiRenderer('#ascii', {
    videoSrc: '${filename}',
    columns: 90,
    colored: true,
    enableMouse: true,
  });
</script>`;
}

function makeSnippetESM(filename: string) {
  return `import { AsciiRenderer } from './ascii-renderer.es.js';

new AsciiRenderer('#ascii', {
  videoSrc: '${filename}',
  columns: 90,
  colored: true,
  enableMouse: true,
});`;
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-label">{label}</span>
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="code-pre"><code>{code}</code></pre>
    </div>
  );
}

function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("video.mp4");
  const [isDragging, setIsDragging] = useState(false);
  const [asciiCopied, setAsciiCopied] = useState(false);
  const rendererRef = useRef<AsciiRenderer | null>(null);

  const handleFileUpload = async (file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFileName(file.name);

    if (file.type.startsWith("image/")) {
      const webmUrl = await imageToWebm(file);
      setVideoUrl(webmUrl);
    } else if (file.type.startsWith("video/")) {
      setVideoUrl(URL.createObjectURL(file));
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [videoUrl]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleCopyAscii = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const text = renderer.captureText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setAsciiCopied(true);
    setTimeout(() => setAsciiCopied(false), 2000);
  };

  if (!videoUrl) {
    return (
      <div className="app">
        <main className="hero">
          <div className="title-area">
            <h1>video to ascii</h1>
            <p className="subtitle">
              recreating general intuition ascii art
            </p>
          </div>

          <div
            className={`glass-panel${isDragging ? " drag-over" : ""}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          />

          <label className="generate-btn">
            generate
            <input
              type="file"
              accept="video/*,image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
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
            colored={true}
            charset="code"
            blend={0}
            highlight={30}
            brightness={2.0}
            enableMouse={true}
            trailLength={18}
            enableRipple={false}
            rippleSpeed={40}
            audioEffect={0}
            audioRange={50}
            showStats={false}
            isPlaying={true}
            autoPlay={true}
            onRenderer={(r) => { rendererRef.current = r; }}
          />
        </div>

        <div className="action-bar">
          <button className="action-btn" onClick={handleCopyAscii}>
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
          <CodeBlock label="Script Tag (UMD)" code={makeSnippetUMD(fileName)} />
          <CodeBlock label="ES Module" code={makeSnippetESM(fileName)} />
        </div>
      </main>
    </div>
  );
}

export default App;
