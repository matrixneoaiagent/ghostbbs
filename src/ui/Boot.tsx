import { useState, useEffect, useRef } from 'react';

interface Props {
  onDone: () => void;
}

// Full GHOSTBBS wordmark — 6 rows × 68 cols, fits 80ch terminal
// Spells G-H-O-S-T-B-B-S in box-drawing block characters.
// Plain ASCII box fallback rendered on screens narrower than the wordmark.
const WORDMARK = `\
  ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗██████╗ ██████╗ ███████╗
 ██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝
 ██║  ███╗███████║██║   ██║███████╗   ██║   ██████╔╝██████╔╝███████╗ 
 ██║   ██║██╔══██║██║   ██║╚════██║   ██║   ██╔══██╗██╔══██╗╚════██║ 
 ╚██████╔╝██║  ██║╚██████╔╝███████║   ██║   ██████╔╝██████╔╝███████║ 
  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═════╝ ╚═════╝ ╚══════╝`;

const MODEM_LINES: Array<{ text: string; delay: number; dim?: boolean }> = [
  { text: 'ATZ',                                 delay: 0 },
  { text: 'OK',                                  delay: 180,  dim: true },
  { text: 'ATDT 1-900-BBS-NODE',                 delay: 420 },
  { text: 'CONNECT 1200',                        delay: 950,  dim: true },
  { text: '',                                    delay: 1080 },
  { text: 'GHOSTBBS v2.3  //  NODE 0x1F',        delay: 1180 },
  { text: 'Last maintenance: 1994-08-12',        delay: 1340, dim: true },
  { text: '',                                    delay: 1420 },
  { text: 'The sysop is not in. The board is.',  delay: 1500 },
];

const TOTAL_MS = 1900;

export default function Boot({ onDone }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);
  const doneRef = useRef(false);

  function finish() {
    if (!doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  }

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    MODEM_LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), line.delay));
    });

    timers.push(setTimeout(finish, TOTAL_MS));

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="boot-screen">
      <pre className="wordmark" aria-label="GHOSTBBS">{WORDMARK}</pre>

      <div className="boot-modem">
        {MODEM_LINES.slice(0, visibleCount).map((line, i) => (
          <div key={i} className={`boot-line${line.dim ? ' dim' : ''}`}>
            {line.text || <>&nbsp;</>}
          </div>
        ))}
      </div>

      <p className="boot-skip">
        <button onClick={finish}>[ SKIP ]</button>
      </p>
    </div>
  );
}
