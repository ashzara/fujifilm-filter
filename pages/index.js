import { useState, useRef, useCallback } from 'react';

const SCENE_LABELS = {
  flash:       'Flash / studio',
  lowlight:    'Low-light ambient',
  daylight:    'Bright daylight',
  overexposed: 'Overexposed',
};

export default function Home() {
  const [original,  setOriginal]  = useState(null);
  const [processed, setProcessed] = useState(null);
  const [scene,     setScene]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [grain,     setGrain]     = useState(true);
  const inputRef = useRef();

  const run = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setError(null); setProcessed(null); setScene(null);
    setOriginal(URL.createObjectURL(file));
    setLoading(true);
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await fetch('/api/process', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      setProcessed(URL.createObjectURL(await res.blob()));
      setScene(res.headers.get('X-Scene-Type'));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  return (
    <main style={s.page}>
      <h1 style={s.title}>FUJIFILM FILTER</h1>
      <p style={s.sub}>Classic Chrome · Superia 400 · Frontier scan aesthetic</p>

      <div
        style={s.drop}
        onClick={() => !loading && inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); run(e.dataTransfer.files[0]); }}
        onDragOver={(e) => e.preventDefault()}
      >
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => run(e.target.files[0])} />
        {loading ? 'Processing…' : 'Drop a photo here or click to upload'}
      </div>

      <label style={s.check}>
        <input type="checkbox" checked={grain} onChange={(e) => setGrain(e.target.checked)} />
        &nbsp;Film grain
      </label>

      {error && <p style={s.err}>{error}</p>}
      {scene  && <p style={s.tag}>Scene: <b>{SCENE_LABELS[scene] || scene}</b></p>}

      {(original || processed) && (
        <div style={s.grid}>
          {original  && <Pane label="ORIGINAL"  src={original} />}
          {processed && <Pane label="FUJIFILM"  src={processed} download />}
        </div>
      )}
    </main>
  );
}

function Pane({ label, src, download: dl }) {
  return (
    <figure style={{ margin: 0 }}>
      <p style={s.cap}>{label}</p>
      <img src={src} alt={label} style={{ width: '100%', display: 'block', borderRadius: 2 }} />
      {dl && <a href={src} download="fujifilm.jpg" style={s.dl}>↓ Download</a>}
    </figure>
  );
}

const s = {
  page:  { fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.25rem' },
  title: { fontWeight: 300, letterSpacing: '0.1em', fontSize: '1.3rem', margin: 0 },
  sub:   { color: '#999', fontSize: '0.8rem', marginTop: 4, letterSpacing: '0.05em' },
  drop:  { border: '1px dashed #bbb', borderRadius: 4, padding: '3rem', textAlign: 'center',
           cursor: 'pointer', background: '#f9f9f9', color: '#777', margin: '1.5rem 0', fontSize: '0.9rem' },
  check: { fontSize: '0.82rem', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', marginBottom: '1rem' },
  err:   { color: '#b00', fontSize: '0.85rem' },
  tag:   { color: '#888', fontSize: '0.78rem', marginBottom: '1.25rem' },
  grid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' },
  cap:   { fontSize: '0.68rem', letterSpacing: '0.1em', color: '#bbb', margin: '0 0 6px' },
  dl:    { display: 'inline-block', marginTop: 6, fontSize: '0.78rem', color: '#666', textDecoration: 'none' },
};
