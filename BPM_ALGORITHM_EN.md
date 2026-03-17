# How BPM is Calculated — Ambient Beat Monitor

## Overview

BPM (Beats Per Minute) is measured continuously from the surrounding ambient audio — not from any identified song. The goal is to capture the **rhythmic energy of the environment** (background music, rhythmic sounds, etc.), not the precise BPM of a specific track.

---

## Measurement Cycle

```
record 5s → detect BPM → write to Supabase → sleep 10s → repeat
```

Every 15 seconds, the Pi records 5 seconds of audio and computes one BPM reading.

---

## How It Works

### 1. Recording

- Device: `plughw:adau7002` (MEMS I2S microphone)
- Format: `48kHz, S32_LE, stereo` — native rate for the adau7002
- Duration: **5 seconds**
- Post-processing: volume boosted with `sox norm -3` before analysis, because the MEMS mic captures very quietly

### 2. Beat Analysis — the aubio library

**What is aubio:**
aubio is an open-source audio analysis library, originally developed in 2003 by Paul Brossier as part of his PhD thesis at Queen Mary University of London. It is widely used in music research, DJ software, and real-time audio applications. It does not use custom or ad-hoc algorithms — it implements **peer-reviewed, standardised methods** from the academic field of Music Information Retrieval (MIR).

**Is this an established method or something custom:**
Established. aubio uses **onset detection + autocorrelation** — two well-documented techniques published and validated in MIR research literature:

- **Onset detection**: identifies the moment a new sound begins, based on changes in spectral energy — first formally described in papers by Brossier, Dixon, and Scheirer in the early 2000s
- **Autocorrelation for tempo estimation**: compares the onset signal against delayed versions of itself to find a repeating period — a fundamental technique in digital signal processing (DSP)

In short: **this is industry-standard, not a homemade heuristic.**

---

**How aubio processes audio:**
aubio does not wait for the whole file before computing — it processes audio **in small consecutive chunks**, similar to how a human ear follows music in real time.

**Slicing the audio:**
A 5-second recording at 48kHz contains 240,000 samples. aubio reads it in chunks of 512 samples at a time (~10ms per chunk), roughly 470 iterations over 5 seconds. At each step it asks: *"is there a beat here?"*

**How aubio detects a beat:**
The human ear recognises a beat because of a sudden change — a drum hit, a bass note, a sharp rise in volume. aubio does the same: it tracks the **energy level** of the audio across each small chunk. When energy spikes relative to what came before, that is called an **onset** — the start of a new sound event.

But an onset is not yet a beat. Speech, a glass clinking, a door closing all produce onsets. The distinguishing factor is **regularity**: in music, onsets recur at consistent intervals. aubio accumulates onsets over time and looks for a **repeating period** — if an onset appears every 0.5 seconds, that corresponds to 120 BPM.

**Window size — seeing enough to find a pattern:**
To detect a period, aubio does not look only at the current 512 samples. It looks back over a window of 1024 samples (~21ms). This window is wide enough to compare "now" against "a moment ago" and detect meaningful change, while filtering out small random fluctuations.

**After 5 seconds:**
aubio collects all beat timestamps throughout the 5-second clip, then synthesises them into a single BPM value — not a simple average, but a weighted estimate that favours more recent beats and beats with higher confidence.

### 3. Filtering the result

Two sanity checks are applied:

- Fewer than 3 beats detected in 5 seconds → discard (likely silence or random noise)
- BPM outside the range 40–220 → discard (outside any realistic musical tempo)

### 4. Confidence score

After aubio returns the beat timestamps, the system computes how **regular** the beat intervals are:

- Calculate the time gap between each consecutive beat
- Compute the mean and standard deviation of those gaps
- Divide standard deviation by mean → this gives the **Coefficient of Variation (CV)**
- `confidence = 1 - (CV × 3)`, clamped to [0, 1]

**What this means:**
- **Regular beats** (clear rhythmic music) → gaps are consistent → low CV → high confidence
- **Irregular beats** (noise, conversation) → gaps are erratic → high CV → low or zero confidence

| Scenario | CV | Confidence |
|---|---|---|
| Dance music, clear rhythm | ~0.05 | ~0.85 |
| Slow ballad, soft rhythm | ~0.25 | ~0.25 |
| Random ambient noise | >0.33 | 0.0 |

---

## Why Does That BPM Number Appear?

A reading like `118.8` means:

1. The mic picked up 5 seconds of ambient sound
2. aubio found energy spikes (onsets) that recurred at roughly 118.8 beats per minute
3. The beat intervals were regular enough to produce a non-zero confidence score
4. The reading was inserted into Supabase

**Important:** if a room has 120 BPM music playing, ~120 will appear. If there is no music but someone is tapping a table rhythmically, that may also appear. The BPM reading measures **ambient rhythmic energy** — it does not identify a song.

---

## Limitations

- **5 seconds is short** — at 60 BPM, only ~5 beats occur, making the estimate less reliable
- **Noise can fake BPM** — fans, air conditioning, and other periodic sounds can produce a repeating pattern that resembles a beat
- **No source discrimination** — the system measures rhythm regardless of what is producing it
- **Volume dependent** — if the environment is very quiet even after boosting, aubio may not detect enough onsets to compute a reading
