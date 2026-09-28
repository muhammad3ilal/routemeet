import { useEffect, useId, useRef, useState } from "react";
import { appleMapsDirections, hasMapCoordinates } from "../../lib/appleMaps.js";
import "./phone-directions.css";

function RouteCode({ url }) {
  const canvas = useRef(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let active = true;
    setState("loading");
    import("qrcode")
      .then(async ({ default: QRCode }) => {
        if (!active || !canvas.current) return;
        await QRCode.toCanvas(canvas.current, url, {
          width: 208,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#171715", light: "#ffffff" },
        });
        if (active) setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => { active = false; };
  }, [url]);

  return (
    <figure className="phone-route-code" aria-busy={state === "loading"}>
      <div className="phone-route-code-image">
        <canvas ref={canvas} hidden={state !== "ready"} role="img" aria-label="Scan this code to open driving directions in Apple Maps" />
        {state === "loading" && <span>Preparing your code…</span>}
        {state === "error" && <span>QR unavailable. Use the link instead.</span>}
      </div>
      <figcaption>Scan with your phone’s camera.</figcaption>
    </figure>
  );
}

export default function PhoneDirections({ venue, origins = [], stale = false }) {
  const id = useId();
  const linkInput = useRef(null);
  const [confirmed, setConfirmed] = useState("");
  const [originId, setOriginId] = useState("");
  const [feedback, setFeedback] = useState(null);
  const venueKey = `${venue?.id}:${venue?.lat}:${venue?.lon}`;
  const availableOrigins = origins.filter(hasMapCoordinates);
  const origin = availableOrigins.find((person) => person.id === originId) || null;
  const url = appleMapsDirections(venue, origin);
  const expanded = confirmed === venueKey && !stale;
  const status = feedback?.url === url ? feedback.status : "";

  useEffect(() => {
    if (stale) setConfirmed("");
  }, [stale]);

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setFeedback({ url, status: "copied" });
    } catch {
      if (linkInput.current?.value === url) {
        linkInput.current.focus();
        linkInput.current.select();
      }
      setFeedback({ url, status: "copy-manually" });
    }
  }

  async function shareLink() {
    try {
      await navigator.share({
        title: `Meet at ${venue.name}`,
        text: `Meet at ${venue.name}. Open the link for driving directions.`,
        url,
      });
    } catch (error) {
      if (error.name !== "AbortError")
        setFeedback({ url, status: "share-unavailable" });
    }
  }

  if (!url) return null;
  return (
    <section className="phone-directions" aria-label="Choose this meeting place">
      <div className="phone-directions-choice">
        <button
          type="button"
          className="primary"
          disabled={stale}
          aria-expanded={expanded}
          aria-controls={`${id}-phone`}
          onClick={() => {
            setConfirmed(expanded ? "" : venueKey);
            setFeedback(null);
          }}
        >
          {expanded ? "Meeting here ✓" : "Meet here"}
        </button>
        <span>Take the directions with you.</span>
      </div>
      {expanded && (
        <div id={`${id}-phone`} className="phone-directions-panel">
          <div className="phone-directions-content">
            <h3>Send to your phone</h3>
            <p>Scan the code, or share the Apple Maps link.</p>
            <label htmlFor={`${id}-origin`}>Start from</label>
            <select
              id={`${id}-origin`}
              value={origin?.id || ""}
              onChange={(event) => {
                setOriginId(event.target.value);
                setFeedback(null);
              }}
            >
              <option value="">My phone’s current location</option>
              {availableOrigins.map((person) => (
                <option key={person.id} value={person.id}>{person.name} — starting place</option>
              ))}
            </select>
            <div className="phone-directions-actions">
              <a className="phone-maps-link" href={url} target="_blank" rel="noreferrer">Open in Apple Maps ↗</a>
              <button type="button" onClick={copyLink}>{status === "copied" ? "Copied" : "Copy link"}</button>
              {typeof navigator.share === "function" && <button type="button" onClick={shareLink}>Share link</button>}
            </div>
            <label htmlFor={`${id}-link`} className="phone-directions-link-label">Apple Maps link</label>
            <input id={`${id}-link`} ref={linkInput} type="url" value={url} readOnly onFocus={(event) => event.target.select()} spellCheck={false} />
            <div className="phone-directions-feedback" role="status" aria-live="polite">
              {status === "copied" && <span className="sr-only">Apple Maps link copied.</span>}
              {status === "copy-manually" && <p>Copy the selected link, or scan the code.</p>}
              {status === "share-unavailable" && <p>Sharing couldn’t open. Copy the link or scan the code.</p>}
            </div>
            <p className="phone-directions-note">Apple Maps calculates its own route and arrival time.</p>
          </div>
          <RouteCode key={url} url={url} />
        </div>
      )}
    </section>
  );
}
