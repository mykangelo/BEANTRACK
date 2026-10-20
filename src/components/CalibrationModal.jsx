import { useState, useEffect } from "react";
import { X, Scale, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { C, mono } from "../appTokens";
import { Button } from "./ui";

export default function CalibrationModal({ onClose, onCalibrate, isBusy, notice }) {
  const [weight, setWeight] = useState("100");
  const [deck, setDeck] = useState("TOP");
  const [localBusy, setLocalBusy] = useState(false);

  useEffect(() => {
    if (notice) setLocalBusy(false);
  }, [notice]);

  // Updated to accept the event (whether from form submit or button click)
  const handleSubmit = (e) => {
    if (e) e.preventDefault(); // Stop the page from reloading
    
    const w = parseFloat(weight);
    if (w > 0) {
      setLocalBusy(true); 
      onCalibrate(deck, w);
    }
  };

  const showResult = !!notice;
  const isLoading = localBusy || isBusy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div 
        className="w-full max-w-sm p-6 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        style={{ background: C.panel, border: `1px solid ${C.glassBorder}`, ...mono }}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg flex items-center gap-2" style={{ ...mono, color: C.text }}>
            <Scale size={18} /> Calibrate Scale
          </h3>
          <button 
            onClick={onClose} 
            disabled={isLoading && !showResult}
            className="text-gray-500 hover:text-black disabled:opacity-50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {showResult ? (
          <div className="flex flex-col items-center text-center gap-4 py-4">
            {notice.severity === "success" ? (
              <CheckCircle2 size={48} style={{ color: C.green }} />
            ) : (
              <AlertCircle size={48} style={{ color: C.red }} />
            )}
            
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{notice.title}</div>
              <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 6, wordBreak: "break-word" }}>
                {notice.message}
              </div>
            </div>

            <Button onClick={onClose} variant="action" className="w-full justify-center mt-2">
              Done
            </Button>
          </div>
        ) : (
          // Keep the form so pressing "Enter" in the input field still works
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                Select Deck
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setDeck("TOP")}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border disabled:opacity-50"
                  style={{
                    background: deck === "TOP" ? C.goldGradient : C.glassStrong,
                    borderColor: deck === "TOP" ? C.amber : C.glassLine,
                    color: deck === "TOP" ? C.sidebarBg : C.text
                  }}
                >
                  Top (Large)
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setDeck("BOT")}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors border disabled:opacity-50"
                  style={{
                    background: deck === "BOT" ? C.goldGradient : C.glassStrong,
                    borderColor: deck === "BOT" ? C.amber : C.glassLine,
                    color: deck === "BOT" ? C.sidebarBg : C.text
                  }}
                >
                  Bottom (Medium)
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.textFaint, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6, display: "block" }}>
                Known Weight (g)
              </label>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                disabled={isLoading}
                className="w-full p-2.5 rounded-lg border focus:outline-none transition-colors disabled:opacity-50"
                style={{ background: C.glassStrong, border: `1px solid ${C.glassLine}`, color: C.text, ...mono }}
                placeholder="e.g. 100"
                required
              />
            </div>

            <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ background: `${C.amber}15`, color: C.textDim }}>
              Place the known weight on the selected deck and press Calibrate. The ESP32 will calculate the new factor and save it to its flash memory.
            </div>

            {/* CHANGED: Added onClick={handleSubmit} and removed type="submit" to fix the button click */}
            <Button 
              onClick={handleSubmit} 
              variant="action" 
              disabled={isLoading} 
              className="w-full justify-center"
            >
              {isLoading ? <><Loader2 size={16} className="animate-spin" /> Calibrating...</> : "Run Calibration"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}